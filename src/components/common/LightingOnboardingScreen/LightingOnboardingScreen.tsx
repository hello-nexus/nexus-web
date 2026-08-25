import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { AlertTriangle, ArrowLeft, Ban, CheckCheck, Lightbulb, RotateCw } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { Overlay } from '../Overlay/Overlay';
import { Button } from '../Button/Button';
import { EmptyState } from '../EmptyState/EmptyState';
import { ConflictAppCard } from '../ConflictAppCard/ConflictAppCard';
import { useConflictApps } from '../../../hooks/useConflictApps';
import { HYTE_NEXUS2_CONFLICT_ID } from '../../../api/conflicts';
import { completeLightingOnboarding } from '../../../api/onboarding';
import {
  fetchLightingDevices,
  fetchLightingStatus,
  setLightingDeviceControlled,
  startStatic,
  type LightingDevice,
} from '../../../api/lighting';
import { defaultParamsFor } from '../../../types/lighting';
import { ZoneCard, zoneCardUnavailable } from '../../../panel/widgets/lighting/page/ZoneCard';
import { visibleCards } from '../../../panel/widgets/lighting/page/zoneUtils';
import styles from './LightingOnboardingScreen.module.scss';

export interface LightingOnboardingScreenProps {
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
export function LightingOnboardingScreen({ open, onComplete, onBack }: LightingOnboardingScreenProps) {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<LightingDevice[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const [testFill, setTestFill] = useState<string | null>(null);
  const { conflicts: allConflicts } = useConflictApps(open);
  // HYTE Nexus 2 is excluded here: its shutdown offer belongs to the
  // Nexus2WelcomeScreen gate, which precedes this screen on eligible
  // installs - by the time this strip shows, that offer already happened.
  // An ineligible install leans on the post-onboarding sidebar conflict
  // warning instead, so this strip never duplicates the dedicated flow.
  const conflicts = allConflicts.filter(c => c.id !== HYTE_NEXUS2_CONFLICT_ID);
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
        setDevices(data.devices ?? []);
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

  useEffect(() => {
    if (!open) return;
    void refresh();
    const timer = setInterval(() => { void refresh(); }, POLL_MS);
    return () => clearInterval(timer);
  }, [open, refresh]);

  // persist=false: this is a look at the lights, not a saved choice.
  const runTestFill = useCallback(async (key: string) => {
    setTestFill(key);
    try { await startStatic(key, 1, 0, 0, 1, 1, defaultParamsFor(key), false); } catch { /* best-effort */ }
  }, []);

  if (!open) return null;

  const cards = devices === null ? null : visibleCards(devices);
  const toggleables = (cards ?? []).filter(isToggleable);

  const handleToggle = (card: LightingDevice) => {
    const nextControlled = card.controlled === false;
    mutatedAtRef.current = Date.now();
    pendingWritesRef.current += 1;
    lastWriteStartAtRef.current = Date.now();
    setLightingDeviceControlled(card.id, nextControlled)
      .catch(() => { /* poll reconciles */ })
      .finally(() => {
        pendingWritesRef.current -= 1;
        mutatedAtRef.current = Date.now();
      });
    setDevices(prev => prev?.map(d => (d.id === card.id ? { ...d, controlled: nextControlled } : d)) ?? prev);
  };

  const handleSetAll = (controlled: boolean) => {
    const targets = toggleables.filter(d => (d.controlled !== false) !== controlled);
    if (targets.length === 0) return;
    const ids = new Set(targets.map(d => d.id));
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
      <div className={styles.hero}>
        <span className={styles.heroIcon} aria-hidden>
          <Lightbulb size={40} />
        </span>
        <h1 className={styles.title}>{t('lightingOnboarding.title')}</h1>
        <p className={styles.subtitle}>{t('lightingOnboarding.subtitle')}</p>
      </div>

      {conflicts.length > 0 && (
        <div className={styles.conflicts}>
          <p className={styles.conflictsIntro}>
            <AlertTriangle className={styles.conflictsIcon} aria-hidden />
            {t('conflicts.modal.intro')}
          </p>
          <ul className={styles.conflictList}>
            {conflicts.map(c => (
              <li key={c.id}>
                <ConflictAppCard conflict={c} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {cards !== null && cards.length > 0 && (
        <div className={styles.bulkRow}>
          <Button
            tone="ghost"
            size="sm"
            icon={<CheckCheck />}
            disabled={toggleables.every(d => d.controlled !== false)}
            onClick={() => handleSetAll(true)}
          >
            {t('lighting.ledMap.selectAll')}
          </Button>
          <Button
            tone="ghost"
            size="sm"
            icon={<Ban />}
            disabled={toggleables.every(d => d.controlled === false)}
            onClick={() => handleSetAll(false)}
          >
            {t('lightingOnboarding.selectNone')}
          </Button>
        </div>
      )}

      <div className={styles.deviceArea}>
        {cards !== null && cards.length > 0 && (
          <>
            <div className={styles.testStrip} role="group" aria-label={t('lightingOnboarding.testColors')}>
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
            <div className={styles.deviceGrid} role="group" aria-label={t('lightingOnboarding.title')}>
              {cards.map(d => (
                <ZoneCard
                  key={d.id}
                  device={d}
                  toggleMode
                  selected={false}
                  indent={false}
                  onSelect={noop}
                  onTogglePower={noop}
                  onToggleControlled={() => handleToggle(d)}
                  onOpenSettings={noop}
                />
              ))}
            </div>
            {scanning && (
              <p className={styles.scanningNote}>
                <RotateCw className={styles.scanningIcon} aria-hidden />
                {t('lightingOnboarding.scanning')}
              </p>
            )}
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

      <p className={styles.hint}>{t('lightingOnboarding.hint')}</p>

      {error && <p className={styles.error}>{t('welcome.error')}</p>}

      <div className={styles.footerRow}>
        {onBack && (
          <Button
            tone="ghost"
            size="lg"
            icon={<ArrowLeft />}
            disabled={submitting}
            onClick={onBack}
          >
            {t('nav.back')}
          </Button>
        )}
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
