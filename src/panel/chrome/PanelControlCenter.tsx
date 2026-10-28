import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Bluetooth, Lock, Mic, MicOff, MonitorOff, Moon, Pause, Plane, Play, Power, SkipBack, SlidersVertical, SkipForward, Sun, Volume2, VolumeX, Wifi,
} from 'lucide-react';
import { cssPxPerMm } from '../engine/panelGrid';
import {
  CONTROL_CENTER_COMMIT_MM,
  CONTROL_CENTER_DISMISS_MM,
  CONTROL_CENTER_ENGAGE_MM,
  CONTROL_CENTER_FLICK_MM_PER_MS,
  controlCenterBandPx,
  controlCenterGestureEnabled,
  dismissSwipeYields,
  openSwipeYields,
  oppositeThemeMode,
  readSafeAreaTopPx,
} from '../engine/controlCenterGesture';
import { swallowTapFollowUps } from '../engine/tapGuard';
import { usePanelControlCenterSwipe } from '../engine/usePanelControlCenterSwipe';
import { type GestureContact } from '../engine/touchViaPointer';
import { usePanelImmersiveOpen } from '../widgets/common/PanelImmersiveContext';
import { PanelMixerSlider } from '../widgets/common/PanelMixerSlider';
import { IconLabelButton } from '../../components/common/IconLabelButton/IconLabelButton';
import { useTranslation } from '../../lib/i18n';
import { useUnitPrefs } from '../../hooks/useUiSettings';
import { resolveHour12 } from '../../lib/units';
import { useSystemVolume } from '../../hooks/useSystemVolume';
import { useSystemMic } from '../../hooks/useSystemMic';
import { usePanelBrightness, brightnessTargetFor } from '../../hooks/usePanelBrightness';
import { controlActiveMedia, useMedia, type MediaSession } from '../../hooks/useMedia';
import { systemPower } from '../../api/system';
import { fetchRadios, setRadio, type RadioKind, type RadiosState } from '../../api/radios';
import type { PanelSurface } from '../types';
import { ControlCenterMixerView } from './ControlCenterMixerView';
import styles from './PanelControlCenter.module.scss';

const RADIOS_POLL_MS = 2000;

interface PanelControlCenterProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  surface: PanelSurface;
  deviceTouch?: boolean;
  kioskBehavior: boolean;
  // The gesture surface, shared with the actions tray.
  surfaceRef: React.RefObject<HTMLElement | null>;
  // The panel record's display id, when this panel is a promoted monitor.
  displayId?: string;
  isLandscape: boolean;
  resolvedThemeMode: 'dark' | 'light';
  onSetThemeMode: (mode: 'dark' | 'light') => void;
  onScreenSleep: () => void;
  // Reasons the gesture must not arm, owned by the host.
  sheetOpen: boolean;
  trayOpen: boolean;
  offline: boolean;
  rearranging: boolean;
  dragArmed: boolean;
  asleep: boolean;
  // Windows OOBE: only media and volume stay.
  restricted?: boolean;
}

export function activeMediaSession(sessions: Record<string, MediaSession>): MediaSession | null {
  const list = Object.values(sessions);
  if (list.length === 0) return null;
  return list.find(s => s.playback?.playing && !s.playback?.stopped) ?? list[0];
}

export function PanelControlCenter({
  open,
  onOpen,
  onClose,
  surface,
  deviceTouch,
  kioskBehavior,
  surfaceRef,
  displayId,
  isLandscape,
  resolvedThemeMode,
  onSetThemeMode,
  onScreenSleep,
  sheetOpen,
  trayOpen,
  offline,
  rearranging,
  dragArmed,
  asleep,
  restricted = false,
}: PanelControlCenterProps) {
  const { t, language } = useTranslation();
  const immersiveOpen = usePanelImmersiveOpen();
  const sheetRef = useRef<HTMLElement | null>(null);

  const gate = controlCenterGestureEnabled({
    surface, deviceTouch, kioskBehavior, immersiveOpen, sheetOpen, trayOpen, offline, rearranging, dragArmed, asleep,
  });

  // Anything that makes the gesture illegal also puts the sheet away, except screen
  // sleep: the sheet stays open under the fade and is still there on wake.
  const gateIgnoringSleep = controlCenterGestureEnabled({
    surface, deviceTouch, kioskBehavior, immersiveOpen, sheetOpen, trayOpen, offline, rearranging, dragArmed, asleep: false,
  });
  useEffect(() => {
    if (open && !gateIgnoringSleep) onClose();
  }, [open, gateIgnoringSleep, onClose]);

  const pxPerMm = useMemo(() => cssPxPerMm(surface), [surface]);
  const [safeTop, setSafeTop] = useState(0);
  useEffect(() => {
    if (!gate) return undefined;
    const measure = () => setSafeTop(readSafeAreaTopPx());
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [gate]);
  const bandPx = controlCenterBandPx(pxPerMm, safeTop);

  const openSwipe = usePanelControlCenterSwipe({
    enabled: gate && !open,
    surfaceRef,
    direction: 'down',
    engagePx: CONTROL_CENTER_ENGAGE_MM * pxPerMm,
    commitPx: CONTROL_CENTER_COMMIT_MM * pxPerMm,
    flickPxPerMs: CONTROL_CENTER_FLICK_MM_PER_MS * pxPerMm,
    shouldYield: useCallback((c: GestureContact) => openSwipeYields(c.clientY, bandPx, c.target), [bandPx]),
    onCommit: onOpen,
  });

  const dismissSwipe = usePanelControlCenterSwipe({
    enabled: gate && open,
    surfaceRef: sheetRef,
    direction: 'up',
    engagePx: CONTROL_CENTER_ENGAGE_MM * pxPerMm,
    commitPx: CONTROL_CENTER_DISMISS_MM * pxPerMm,
    flickPxPerMs: CONTROL_CENTER_FLICK_MM_PER_MS * pxPerMm,
    shouldYield: useCallback((c: GestureContact) => dismissSwipeYields(c.target), []),
    onCommit: onClose,
  });

  const { reset: resetOpenSwipe } = openSwipe;
  const { reset: resetDismissSwipe } = dismissSwipe;
  useEffect(() => {
    if (!gate || open) resetOpenSwipe();
    if (!gate || !open) resetDismissSwipe();
  }, [gate, open, resetOpenSwipe, resetDismissSwipe]);

  const opening = openSwipe.state === 'dragging' && !open;
  const dismissing = dismissSwipe.state === 'dragging' && open;
  const dragProgress = opening ? Math.min(1, openSwipe.offset / (CONTROL_CENTER_COMMIT_MM * pxPerMm * 2)) : 0;
  const showScrim = open || opening;

  const visible = open || opening;
  const [view, setView] = useState<'main' | 'mixer'>('main');
  // Fresh on every open, whatever the last session left on screen.
  useLayoutEffect(() => { if (visible) setView('main'); }, [visible]);

  // The body stays mounted through the close slide so the content does not
  // vanish mid-motion; the sheet's transitionend lets go of it.
  const [bodyMounted, setBodyMounted] = useState(false);
  useEffect(() => {
    if (visible) { setBodyMounted(true); return; }
    // Already fully above the panel (a pull released before it showed): no
    // transition will run, so nothing would ever release the body.
    const el = sheetRef.current;
    if (el && el.getBoundingClientRect().bottom <= 0) setBodyMounted(false);
  }, [visible]);
  const releaseBody = (e: React.TransitionEvent) => {
    if (e.target === e.currentTarget && e.propertyName === 'transform' && !visible) setBodyMounted(false);
  };

  const sheetStyle = opening
    // Follows the finger from fully hidden; --cc-zoom converts the pointer
    // delta back where the sheet is zoomed.
    ? { transform: `translateY(min(0px, calc(-100% + ${openSwipe.offset}px / var(--cc-zoom, 1))))` }
    : dismissing
      ? { transform: `translateY(calc(${-dismissSwipe.offset}px / var(--cc-zoom, 1)))` }
      : undefined;

  return (
    <>
      {showScrim && (
        <div
          className={styles.scrim}
          data-visible={open ? 'true' : undefined}
          data-dragging={opening || dismissing ? 'true' : undefined}
          style={opening ? { opacity: dragProgress } : dismissing ? { opacity: Math.max(0, 1 - dismissSwipe.offset / (CONTROL_CENTER_DISMISS_MM * pxPerMm * 3)) } : undefined}
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        ref={sheetRef}
        className={styles.sheet}
        data-state={open ? (dismissing ? 'dragging' : 'open') : (opening ? 'dragging' : 'closed')}
        data-landscape={isLandscape ? 'true' : undefined}
        style={sheetStyle}
        lang={language}
        aria-label={t('panel.controlCenter.label')}
        aria-hidden={!open && !opening ? true : undefined}
        onTransitionEnd={releaseBody}
        onTransitionCancel={releaseBody}
        onClick={(e) => {
          if (!open) return;
          const target = e.target instanceof Element ? e.target : null;
          if (!target?.closest('[data-cc-keep="true"]')) onClose();
        }}
      >
        {bodyMounted ? (
          <ControlCenterBody
            open={open}
            isLandscape={isLandscape}
            active={visible && !asleep}
            view={view}
            setView={setView}
            language={language}
            surface={surface}
            displayId={displayId}
            resolvedThemeMode={resolvedThemeMode}
            onSetThemeMode={onSetThemeMode}
            onClose={onClose}
            onScreenSleep={onScreenSleep}
            restricted={restricted}
          />
        ) : null}
      </aside>
    </>
  );
}

interface BodyProps {
  open: boolean;
  isLandscape: boolean;
  // Open or being pulled: the body reads and polls only then.
  active: boolean;
  view: 'main' | 'mixer';
  setView: (v: 'main' | 'mixer') => void;
  language: string;
  surface: PanelSurface;
  displayId?: string;
  resolvedThemeMode: 'dark' | 'light';
  onSetThemeMode: (mode: 'dark' | 'light') => void;
  onClose: () => void;
  onScreenSleep: () => void;
  restricted: boolean;
}

function ControlCenterBody({
  open, active, isLandscape, view, setView, language, surface, displayId, resolvedThemeMode, onSetThemeMode, onClose, onScreenSleep, restricted,
}: BodyProps) {
  const { t } = useTranslation();

  // Clock header: follows the app's time-format setting.
  const { timeFormat } = useUnitPrefs();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return undefined;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [active]);
  const timeText = useMemo(
    () => new Intl.DateTimeFormat(language, { hour: 'numeric', minute: '2-digit', hour12: resolveHour12(timeFormat) }).format(now),
    [now, language, timeFormat],
  );
  const dateText = useMemo(
    () => new Intl.DateTimeFormat(language, { weekday: 'long', month: 'long', day: 'numeric' }).format(now),
    [now, language],
  );

  const brightness = usePanelBrightness(active && !restricted, brightnessTargetFor(surface, displayId));
  const volume = useSystemVolume(active, null, 2000);
  const mic = useSystemMic(active);

  const [radios, setRadios] = useState<RadiosState | null>(null);
  // A read that started before a write settled describes the old state and must
  // not overwrite the write's read-back.
  const radioWrites = useRef({ inFlight: 0, settledAt: 0 });
  // Read as soon as the sheet starts to come down, then again every poll
  // interval while it stays up: Wi-Fi and Bluetooth can return after an
  // airplane-off POST has answered, and the OS can change them too.
  useEffect(() => {
    if (!active || restricted) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const startedAt = Date.now();
      const r = await fetchRadios().catch(() => null);
      if (cancelled) return;
      const w = radioWrites.current;
      if (r && w.inFlight === 0 && startedAt >= w.settledAt) setRadios(r);
      timer = setTimeout(tick, RADIOS_POLL_MS);
    };
    void tick();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [active, restricted]);
  // The read-back state is the truth: no rollback on a mismatch, the next
  // read corrects whatever the optimistic flip got wrong.
  const toggleRadio = (kind: RadioKind) => {
    const current = radios?.[kind];
    if (!current) return;
    const w = radioWrites.current;
    w.inFlight += 1;
    setRadios(prev => (prev ? { ...prev, [kind]: { on: !current.on } } : prev));
    void setRadio(kind, !current.on)
      .then(r => { if (r) setRadios(r); })
      .catch(() => {})
      .finally(() => { w.inFlight -= 1; w.settledAt = Date.now(); });
  };

  const media = useMedia(active);
  const session = activeMediaSession(media.sessions);

  // Fit rule: nothing is cut off. The faders give up height first; if the content
  // still overflows, the media card is hidden, then the clock card. A resize, an
  // orientation change or the fonts loading shows every card again and measures
  // afresh in the same layout pass, so cards come back when space returns and
  // nothing flickers. Content changes (the clock text, readings arriving) can only
  // hide more, never show again, which keeps the rule from oscillating.
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [fitLevel, setFitLevel] = useState(0);
  // Bumped by every refit, so the measure runs even when the level is already 0.
  const [fitEpoch, setFitEpoch] = useState(0);
  const refit = useCallback(() => { setFitLevel(0); setFitEpoch(e => e + 1); }, []);
  useEffect(() => { if (!active) refit(); }, [active, refit]);
  useLayoutEffect(() => { refit(); }, [isLandscape, refit]);
  useEffect(() => {
    let cancelled = false;
    window.addEventListener('resize', refit);
    void document.fonts?.ready.then(() => { if (!cancelled) refit(); });
    return () => { cancelled = true; window.removeEventListener('resize', refit); };
  }, [refit]);
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el || view !== 'main' || fitLevel >= 2) return;
    if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) setFitLevel(l => l + 1);
  }, [view, fitLevel, fitEpoch, timeText, radios, session, volume.state.supported, brightness.available, mic.state.supported, brightness.linkDown]);

  if (view === 'mixer') {
    return (
      <div className={styles.content} data-landscape-hint="mixer">
        <ControlCenterMixerView active={active} onBack={() => setView('main')} />
      </div>
    );
  }

  const showBrightness = brightness.available && !restricted;
  const showMic = mic.state.supported;
  const volPct = Math.round(volume.state.volume * 100);
  const micPct = Math.round(mic.state.volume * 100);
  const dark = resolvedThemeMode === 'dark';

  return (
    <div ref={contentRef} className={styles.content} data-open={open ? 'true' : undefined}>
      {fitLevel < 2 && (
      <div className={styles.clock}>
        <div className={styles.time}>{timeText}</div>
        <div className={styles.date}>{dateText}</div>
      </div>
      )}

      <div className={`${styles.card} ${styles.fadersCard}`} data-cc-keep="true">
        <div className={styles.faders}>
          {showBrightness && (
            <PanelMixerSlider
              className={styles.fader}
              min={0}
              max={100}
              value={brightness.value}
              disabled={brightness.linkDown}
              showValue
              valueLabel={`${brightness.value}`}
              topLabel={t('panel.controlCenter.brightness')}
              icon={<Sun strokeWidth={1.7} />}
              ariaLabel={t('panel.controlCenter.brightness')}
              onChange={brightness.preview}
              onCommit={brightness.commit}
            />
          )}
          {showMic && (
            <PanelMixerSlider
              className={styles.fader}
              min={0}
              max={100}
              value={micPct}
              showValue
              valueLabel={`${micPct}`}
              topLabel={t('panel.controlCenter.mic')}
              icon={mic.state.muted ? <MicOff strokeWidth={1.7} /> : <Mic strokeWidth={1.7} />}
              iconButton={{
                ariaLabel: mic.state.muted ? t('panel.controlCenter.mic.unmute') : t('panel.controlCenter.mic.mute'),
                ariaPressed: mic.state.muted,
                active: mic.state.muted,
                onClick: () => { void mic.setMuted(!mic.state.muted); },
              }}
              ariaLabel={t('panel.controlCenter.mic')}
              onChange={v => mic.previewVolume(v / 100)}
              onCommit={v => mic.commitVolume(v / 100)}
            />
          )}
          {volume.state.supported && (
            <PanelMixerSlider
              className={styles.fader}
              min={0}
              max={100}
              value={volPct}
              showValue
              valueLabel={`${volPct}`}
              topLabel={t('panel.controlCenter.volume')}
              icon={volume.state.muted ? <VolumeX strokeWidth={1.7} /> : <Volume2 strokeWidth={1.7} />}
              iconButton={{
                ariaLabel: volume.state.muted ? t('panel.controlCenter.volume.unmute') : t('panel.controlCenter.volume.mute'),
                ariaPressed: volume.state.muted,
                active: volume.state.muted,
                onClick: () => { void volume.setMuted(!volume.state.muted); },
              }}
              ariaLabel={t('panel.controlCenter.volume')}
              onChange={v => volume.commitVolume(v / 100)}
              onCommit={v => volume.commitVolume(v / 100, { flush: true })}
            />
          )}
        </div>
        {showBrightness && brightness.linkDown && (
          <div className={styles.notice} role="status">{t('panel.controlCenter.brightness.usbDown')}</div>
        )}
      </div>

      <div className={`${styles.card} ${styles.gridCard}`} data-cc-keep="true">
        <div className={styles.grid}>
          {!restricted && (
          <>
          <IconLabelButton
            className={styles.tile}
            icon={dark ? <Moon /> : <Sun />}
            label={t('panel.controlCenter.darkMode')}
            active={dark}
            onPress={() => onSetThemeMode(oppositeThemeMode(resolvedThemeMode))}
          />
          <IconLabelButton
            className={styles.tile}
            icon={<Lock />}
            label={t('panel.controlCenter.lockPc')}
            onPress={() => { void systemPower('lock'); onClose(); }}
          />
          <IconLabelButton
            className={styles.tile}
            icon={<Power />}
            label={t('panel.controlCenter.sleepPc')}
            onPress={() => { void systemPower('sleep'); onClose(); }}
          />
          <IconLabelButton
            className={styles.tile}
            icon={<MonitorOff />}
            label={t('panel.controlCenter.screenSleep')}
            onPress={onScreenSleep}
          />
          </>
          )}
          {/* Always present, disabled until volume reads in, so no tile after it shifts. */}
          <IconLabelButton
            className={styles.tile}
            icon={<SlidersVertical />}
            label={t('panel.controlCenter.mixer.title')}
            disabled={!volume.state.supported}
            onPress={() => { swallowTapFollowUps(); setView('mixer'); }}
          />
          {/* After the fixed tiles: the radios arrive late and must not shift them. */}
          {!restricted && radios?.wifi && (
            <IconLabelButton
              className={styles.tile}
              icon={<Wifi />}
              label={t('panel.controlCenter.wifi')}
              active={radios.wifi.on}
              onPress={() => toggleRadio('wifi')}
            />
          )}
          {!restricted && radios?.bluetooth && (
            <IconLabelButton
              className={styles.tile}
              icon={<Bluetooth />}
              label={t('panel.controlCenter.bluetooth')}
              active={radios.bluetooth.on}
              onPress={() => toggleRadio('bluetooth')}
            />
          )}
          {!restricted && radios?.airplane && (
            <IconLabelButton
              className={styles.tile}
              icon={<Plane />}
              label={t('panel.controlCenter.airplane')}
              active={radios.airplane.on}
              onPress={() => toggleRadio('airplane')}
            />
          )}
        </div>
      </div>

      {session && fitLevel < 1 && (
        <div className={`${styles.card} ${styles.mediaCard}`} data-cc-keep="true">
          <div className={styles.media}>
            <div className={styles.mediaText}>
              <div className={styles.mediaTitle}>{session.song.title}</div>
              <div className={styles.mediaArtist}>{session.song.artist}</div>
            </div>
            <div className={styles.mediaButtons}>
              <IconLabelButton
                className={styles.mediaButton}
                variant="bare"
                icon={<SkipBack />}
                ariaLabel={t('panel.controlCenter.media.previous')}
                onPress={() => { void controlActiveMedia('previous'); }}
              />
              <IconLabelButton
                className={styles.mediaButton}
                variant="bare"
                icon={session.playback.playing ? <Pause /> : <Play />}
                ariaLabel={t('panel.controlCenter.media.playPause')}
                onPress={() => { void controlActiveMedia('playpause'); }}
              />
              <IconLabelButton
                className={styles.mediaButton}
                variant="bare"
                icon={<SkipForward />}
                ariaLabel={t('panel.controlCenter.media.next')}
                onPress={() => { void controlActiveMedia('next'); }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
