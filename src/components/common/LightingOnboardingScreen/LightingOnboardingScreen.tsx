import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, Ban, CheckCheck, Lightbulb, PowerOff, RotateCw, SlidersHorizontal, Sparkles } from 'lucide-react';
import { SkipOnboardingButton } from '../SkipOnboardingButton/SkipOnboardingButton';
import { useTranslation } from '../../../lib/i18n';
import { Overlay } from '../Overlay/Overlay';
import { Button } from '../Button/Button';
import { EmptyState } from '../EmptyState/EmptyState';
import { completeLightingOnboarding } from '../../../api/onboarding';
import {
  fetchLightingDevices,
  fetchLightingStatus,
  setLightingDeviceControlled,
  startStatic,
  stopLighting,
  fetchAnimateDefaults,
  cachedAnimateDefaults,
  type LightingDevice,
} from '../../../api/lighting';
import { ZoneCard, zoneCardUnavailable } from '../../../panel/widgets/lighting/page/ZoneCard';
import { visibleCards } from '../../../panel/widgets/lighting/page/zoneUtils';
import { useUiSettingsUpdateSafe } from '../../../hooks/useUiSettings';
import styles from './LightingOnboardingScreen.module.scss';

export interface LightingOnboardingScreenProps {
  /** Skips every remaining onboarding step; renders the top-right escape hatch when provided. */
  onSkipOnboarding?: () => void;
  open: boolean;
  onComplete: () => void;
  /** Steps back to the previous onboarding screen; the Back button only renders when provided. */
  onBack?: () => void;
}

// RGB detection staggers devices in over several seconds after boot, and a
// rescan completion has no push topic, so the list refreshes on a poll while
// the screen is open.
const POLL_MS = 2000;

// Upper bound on the pending-write poll pause; see pendingWritesRef.
const WRITE_PAUSE_CAP_MS = 10_000;

const noop = () => {};

const MODE_ICON_SIZE = 22;

/** In the order they are offered: leave RGB alone, drive it all, or choose. */
const MODE_CHOICES = [
  { key: 'off' as const, Icon: PowerOff },
  { key: 'simple' as const, Icon: Sparkles },
  { key: 'advanced' as const, Icon: SlidersHorizontal },
];

// A few of the simple fills, for checking which lights actually respond. The
// swatch is the fill's own colour; the fills themselves are server-owned, so
// this only names them.
const TEST_FILLS: { key: string; swatch: string }[] = [
  { key: 'simplewhite', swatch: '#ffffff' },
  { key: 'simplered', swatch: '#ff2d2d' },
  { key: 'simpleorange', swatch: '#ff8a1e' },
  { key: 'simplegreen', swatch: '#2fd45a' },
  { key: 'simplecyan', swatch: '#22d3ee' },
  { key: 'simpleblue', swatch: '#2f6bff' },
  { key: 'simpleviolet', swatch: '#a855f7' },
];

// Cards ZoneCard renders non-interactive are excluded from bulk toggles.
const isToggleable = (d: LightingDevice): boolean => !zoneCardUnavailable(d);

/**
 * Last onboarding gate, after the welcome screen (and the Nexus 2 gate on
 * eligible installs) completes: every
 * detected RGB device as a whole-card controlled/ignored toggle, all
 * controlled by default. Non-dismissable like WelcomeScreen; Continue is the
 * only way through, and it only dismisses once the completion flag write
 * succeeds. Device toggles write through immediately (same call the lighting
 * page uses), so Continue has nothing to batch.
 */
export function LightingOnboardingScreen({ open, onComplete, onBack, onSkipOnboarding }: LightingOnboardingScreenProps) {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<LightingDevice[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const [testFill, setTestFill] = useState<string | null>(null);
  // Which way the app opens after this, and whether this screen picks devices
  // at all. Simple drives everything, so there is nothing here to choose.
  const [mode, setMode] = useState<'simple' | 'advanced' | 'off'>('simple');
  const updateUiSettings = useUiSettingsUpdateSafe();
  const devicesRef = useRef<LightingDevice[] | null>(null);
  devicesRef.current = devices;
  // What the user asked for per device, held until the service reports it.
  // A poll that started before the write lands still answers with the old
  // value, and applying it puts the card back the way it was.
  const intentRef = useRef(new Map<string, boolean>());
  // Simple drives everything and No lighting drives nothing; only advanced
  // shows each device as the user left it.
  const displayDevice = (d: LightingDevice): LightingDevice => (
    mode === 'simple' ? { ...d, controlled: true }
      : mode === 'off' ? { ...d, controlled: false }
        : d
  );

  // Renders in each card's own LED strip, the way a Static pick does.
  const testSwatch = TEST_FILLS.find(f => f.key === testFill)?.swatch;
  const testPick = testFill && testSwatch
    ? { key: testFill, hex: testSwatch, slot: 0, version: testFill }
    : undefined;
  // Timestamp of the last local toggle (bumped again when its write settles);
  // a poll response whose fetch started before it would clobber the
  // optimistic flip with pre-write server state.
  const mutatedAtRef = useRef(0);
  // Outstanding controlled-write count. A poll dispatched after a click but
  // served before the POST commits still carries pre-write state - the
  // timestamp guard alone cannot see that window, so device-list application
  // also pauses while any write is in flight. The pause is capped from the
  // last write start: postService has no timeout, and a never-settling write
  // must degrade back to eventual consistency, not freeze the list.
  const pendingWritesRef = useRef(0);
  const lastWriteStartAtRef = useRef(0);
  // Serializes polls: a tick during an in-flight fetch is skipped, so a slow
  // response can never land after (and overwrite) a newer one.
  const pollInFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (pollInFlightRef.current) return;
    pollInFlightRef.current = true;
    try {
      const startedAt = Date.now();
      const [data, status] = await Promise.all([
        fetchLightingDevices().catch(() => null),
        fetchLightingStatus().catch(() => null),
      ]);
      const writesPending = pendingWritesRef.current > 0
        && Date.now() - lastWriteStartAtRef.current < WRITE_PAUSE_CAP_MS;
      if (data && mutatedAtRef.current < startedAt && !writesPending) {
        const intents = intentRef.current;
        const fresh = (data.devices ?? []).map(d => {
          const want = intents.get(d.id);
          if (want === undefined) return d;
          if ((d.controlled !== false) === want) { intents.delete(d.id); return d; }
          return { ...d, controlled: want };
        });
        setDevices(fresh);
      }
      // isInit=false with the RGB subprocess up means the bridge is still
      // coming online: treat it as scanning so a fresh boot shows progress,
      // not "no devices". With the subprocess down (lighting off entirely)
      // no devices can ever arrive, so that is the real empty state.
      setScanning(status?.scanning === true || (data?.isInit === false && status?.rgbRunning === true));
    } finally {
      pollInFlightRef.current = false;
    }
  }, []);

  // Polls only until a scan has settled with devices in hand. Left running it
  // keeps rebuilding the list underneath the user, which reorders the cards
  // and makes a click land on a card object that no longer exists.
  const settled = devices !== null && devices.length > 0 && !scanning;
  useEffect(() => {
    if (!open || settled) return;
    void refresh();
    const timer = setInterval(() => { void refresh(); }, POLL_MS);
    return () => clearInterval(timer);
  }, [open, settled, refresh]);

  // Primes the cache the test fills read their colours from.
  useEffect(() => {
    if (!open) return;
    void fetchAnimateDefaults();
  }, [open]);

  // Each fill's colour lives in its server-side template slot, not in the key:
  // the simple fills share one parameter set, so sending generic params paints
  // every one of them the same.
  const runTestFill = useCallback(async (key: string) => {
    setTestFill(key);
    const bundle = (cachedAnimateDefaults() ?? {})[key];
    const look = bundle?.slots[bundle.selected];
    try {
      await startStatic(
        key,
        look?.intensity ?? 1,
        look?.hue ?? 0,
        look?.colorize ?? 0,
        look?.saturation ?? 1,
        look?.contrast ?? 1,
        look?.params,
        // A look at the lights, not a saved choice.
        false,
      );
    } catch { /* best-effort */ }
  }, []);

  if (!open) return null;

  const cards = devices === null ? null : visibleCards(devices);
  const toggleables = (cards ?? []).filter(isToggleable);

  const handleToggle = (card: LightingDevice) => {
    mutatedAtRef.current = Date.now();
    pendingWritesRef.current += 1;
    lastWriteStartAtRef.current = Date.now();
    // The live value, not the captured card: a rescan can replace the device
    // objects between render and click, and a stale one would invert the write.
    const live = devicesRef.current?.find(d => d.id === card.id) ?? card;
    const nextControlled = live.controlled === false;
    intentRef.current.set(card.id, nextControlled);
    setDevices(prev => prev?.map(d => (d.id === card.id ? { ...d, controlled: nextControlled } : d)) ?? prev);
    setLightingDeviceControlled(card.id, nextControlled)
      .catch(() => { /* poll reconciles */ })
      .finally(() => {
        pendingWritesRef.current -= 1;
        mutatedAtRef.current = Date.now();
      });
  };

  const handleSetAll = (controlled: boolean) => {
    const targets = toggleables.filter(d => (d.controlled !== false) !== controlled);
    if (targets.length === 0) return;
    const ids = new Set(targets.map(d => d.id));
    for (const id of ids) intentRef.current.set(id, controlled);
    mutatedAtRef.current = Date.now();
    pendingWritesRef.current += targets.length;
    lastWriteStartAtRef.current = Date.now();
    void Promise.allSettled(targets.map(d => setLightingDeviceControlled(d.id, controlled)))
      .then(() => {
        pendingWritesRef.current -= targets.length;
        mutatedAtRef.current = Date.now();
      });
    setDevices(prev => prev?.map(d => (ids.has(d.id) ? { ...d, controlled } : d)) ?? prev);
  };

  const handleContinue = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(false);
    try {
      // Simple drives every device, so anything switched off here goes back on
      // rather than sitting dark on a page with no control to explain it.
      if (mode === 'off') {
        // Nothing to drive: stop the engine rather than leave it running over
        // devices the user just said they do not want lit.
        await stopLighting().catch(() => null);
      }
      if (mode === 'simple') {
        const off = (devicesRef.current ?? []).filter(d => d.controlled === false);
        if (off.length > 0) {
          intentRef.current.clear();
          await Promise.allSettled(off.map(d => setLightingDeviceControlled(d.id, true)));
        }
      }
      // 'off' has no page of its own; it opens simple, with lighting stopped.
      updateUiSettings({ lightingDashboardMode: mode === 'advanced' ? 'advanced' : 'simple' });
      const result = await completeLightingOnboarding();
      if (result?.lightingCompleted) {
        onComplete();
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Overlay
      open={open}
      onClose={noop}
      noEscDismiss
      noBackdropDismiss
      onEnter={handleContinue}
      autoFocus="container"
      ariaLabel={t('lightingOnboarding.title')}
      className={styles.surface}
      backdropClassName={styles.backdrop}
    >
      <div className={styles.topBar}>
        {onBack ? (
          <Button tone="ghost" size="sm" icon={<ArrowLeft />} disabled={submitting} onClick={onBack}>
            {t('nav.back')}
          </Button>
        ) : <span />}
        {onSkipOnboarding ? <SkipOnboardingButton onSkip={onSkipOnboarding} /> : <span />}
      </div>
      <div className={styles.hero}>
        <span className={styles.heroIcon} aria-hidden>
          <Lightbulb size={40} />
        </span>
        <h1 className={styles.title}>{t('lightingOnboarding.title')}</h1>
      </div>

      <div className={styles.modeRow} role="radiogroup" aria-label={t('lightingOnboarding.modeLabel')}>
        {MODE_CHOICES.map(({ key, Icon }) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={mode === key}
            className={`${styles.modeCard} ${mode === key ? styles.modeCardActive : ''}`}
            onClick={() => setMode(key)}
          >
            <span className={styles.modeIcon} aria-hidden><Icon size={MODE_ICON_SIZE} /></span>
            <span className={styles.modeText}>
              <span className={styles.modeName}>{t(`lightingOnboarding.mode.${key}`)}</span>
              <span className={styles.modeHint}>{t(`lightingOnboarding.mode.${key}.hint`)}</span>
            </span>
          </button>
        ))}
      </div>


      {cards !== null && cards.length > 0 && (
        <div className={styles.bulkRow}>
          <Button
            tone="ghost"
            size="sm"
            icon={<CheckCheck />}
            disabled={mode !== 'advanced' || toggleables.every(d => d.controlled !== false)}
            onClick={() => handleSetAll(true)}
          >
            {t('lighting.ledMap.selectAll')}
          </Button>
          <Button
            tone="ghost"
            size="sm"
            icon={<Ban />}
            disabled={mode !== 'advanced' || toggleables.every(d => d.controlled === false)}
            onClick={() => handleSetAll(false)}
          >
            {t('lightingOnboarding.selectNone')}
          </Button>
        </div>
      )}

      <div className={styles.deviceArea}>
        {cards !== null && cards.length > 0 && (
          <>
            <div
              className={`${styles.deviceGrid} ${mode === 'advanced' ? '' : styles.deviceGridLocked} ${mode === 'off' ? styles.deviceGridOff : ''}`}
              role="group"
              aria-label={t('lightingOnboarding.title')}
            >
              {cards.map(raw => (
                <ZoneCard
                  key={raw.id}
                  device={displayDevice(raw)}
                  ledPick={testPick}
                  toggleMode
                  selected={false}
                  indent={false}
                  onSelect={noop}
                  onTogglePower={noop}
                  onToggleControlled={mode === 'advanced' ? () => handleToggle(raw) : undefined}
                  onOpenSettings={noop}
                />
              ))}
            </div>
          </>
        )}
        {cards !== null && cards.length === 0 && (scanning ? (
          <EmptyState
            icon={<RotateCw className={styles.scanningIcon} />}
            title={t('lightingOnboarding.scanning')}
          />
        ) : (
          <EmptyState
            icon={<Lightbulb />}
            title={t('lighting.devices.empty')}
            hint={t('lightingOnboarding.emptyHint')}
          />
        ))}
      </div>

      {/* Below the listing and outside its scroller: the strip and the scanning
          note must not resize the scrollable area as devices arrive. */}
      {scanning && cards !== null && cards.length > 0 && (
        <p className={styles.scanningNote}>
          <RotateCw className={styles.scanningIcon} aria-hidden />
          {t('lightingOnboarding.scanning')}
        </p>
      )}

      {cards !== null && cards.length > 0 && (
        <div className={`${styles.testStrip} ${mode === 'off' ? styles.testStripOff : ''}`} role="group" aria-label={t('lightingOnboarding.testColors')}>
          <span className={styles.testLabel}>{t('lightingOnboarding.testColors')}</span>
          {TEST_FILLS.map(f => (
            <button
              key={f.key}
              type="button"
              className={`${styles.swatch} ${testFill === f.key ? styles.swatchActive : ''}`}
              style={{ '--swatch': f.swatch } as CSSProperties}
              aria-label={t(`lighting.controls.${f.key}`)}
              title={t(`lighting.controls.${f.key}`)}
              aria-pressed={testFill === f.key}
              onClick={() => { void runTestFill(f.key); }}
            />
          ))}
        </div>
      )}

      <p className={styles.hint}>{t('lightingOnboarding.hint')}</p>

      {error && <p className={styles.error}>{t('welcome.error')}</p>}

      <div className={styles.footerRow}>
        <Button
          tone="accent"
          size="lg"
          onClick={handleContinue}
          loading={submitting}
          loadingHidesLabel
          className={styles.continueButton}
        >
          {t('lightingOnboarding.continue')}
        </Button>
      </div>
    </Overlay>
  );
}
