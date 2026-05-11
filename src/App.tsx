import { Fragment, useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense, type ReactNode } from 'react';
import {
  Activity, LayoutDashboard, Lightbulb, Fan, Settings,
  Bug, Usb, PanelLeftClose, Smartphone,
  LogOut, ShieldAlert, ShieldCheck,
  Wrench, Gauge, Users,
} from 'lucide-react';
import classNames from 'classnames';
import { Sidebar } from './components/Sidebar/Sidebar';
import { Button } from './components/Button/Button';
import { ServiceLaunchButton } from './components/ServiceLaunchButton/ServiceLaunchButton';
import { Popover } from './components/Popover/Popover';
import { ProfileDropdown } from './components/ProfileDropdown/ProfileDropdown';
import { DevicePopup } from './components/DevicePopup/DevicePopup';
import { ConfirmDialog } from './components/ConfirmDialog/ConfirmDialog';
import { EditableText } from './components/Editable/EditableText';
import { Placeholder } from './components/views/Placeholder';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ComponentDetailView } from './components/views/ComponentDetailView';
import { BenchmarkView } from './components/views/BenchmarkView/BenchmarkView';
import { CoolingView } from './components/views/CoolingView';
import { DashboardView } from './components/views/DashboardView/DashboardView';
import { MonitoringView } from './components/views/MonitoringView';
import PanelApp from './panel/PanelApp';
import { PanelSimulatorContent } from './panel/embed/PanelSimulatorContent';
import { SIMULATOR_QUERY_FLAG } from './panel/embed/simulatorProtocol';
import OverlayShell from './overlay/OverlayShell';
import { PairRedirect } from './PairRedirect';
import { ToolsView } from './components/views/ToolsView';
import { SettingsView } from './components/views/SettingsView';
import { DevicesView } from './components/views/DevicesView/DevicesView';
import { LightingView } from './components/views/LightingView';
import { useServiceStatus } from './hooks/useServiceStatus';
import { useServiceState } from './hooks/useServiceState';
import { useProcessElevation, type ProcessElevationHookState } from './hooks/useProcessElevation';
import { useProfiles } from './hooks/useProfiles';
import { useRoute } from './hooks/useRoute';
import { useBuilder } from './hooks/useBuilder';
import { fetchService } from './api/service';
import {
  allocatePanelDeviceWithStatus,
  claimPanelPhonePairing,
  fetchPanelPhonePairQr,
  fetchPanelPhoneSessions,
  renamePanelPhoneSession,
  revokeAllPanelPhoneSessions,
  revokePanelPhoneSession,
  type PanelPhonePairQr,
  type PanelPhoneSessionsResponse,
} from './api/panel';
import { inferSurfaceFromViewport } from './panel/inferSurface';
import { storePhoneToken } from './api/auth';
import { MultiplexContext, useMultiplexConnection } from './hooks/useMultiplexSocket';
import { UiSettingsProvider } from './hooks/useUiSettings';
import * as monitoringStore from './lib/monitoringStore';
import type { MonitoringFrame } from './hooks/useMonitoringFrame';
import type { ScreenTimeData } from './hooks/useScreenTime';
import { useTranslation, I18nProvider } from './lib/i18n';
import { applyThemeMode, applyAccentColor, cachePreferencesLocally } from './lib/settings';
import type { UiSettings } from './api/profiles';
import type { Language, ThemeMode } from './lib/settings';
import type { ComponentCategory, ComponentOption } from './types/builder';
import styles from './App.module.scss';

const PANEL_DEVICE_ID_KEY = 'qos_panel_device_id';
const RESERVED_PANEL_PATH_SEGMENTS = new Set(['phone', 'q60', 'devices']);

const BuilderView = lazy(() => import('./components/views/BuilderView'));

const ICON_SIZE = 18;
const PHONE_PANEL_PWA_KEY = 'qos_phone_panel_pwa';
const PORTAL_URL = 'https://nexusqos.com';

const SERVICE_NAV_KEYS = [
  'dashboard', 'monitoring', 'lighting', 'cooling', 'devices', 'settings',
] as const;

const PORTAL_NAV_KEYS = ['builder', 'benchmark', 'community'] as const;

const NAV_ICONS: Record<string, ReactNode> = {
  dashboard:  <LayoutDashboard size={ICON_SIZE} />,
  monitoring: <Activity size={ICON_SIZE} />,
  lighting:   <Lightbulb size={ICON_SIZE} />,
  cooling:    <Fan size={ICON_SIZE} />,
  devices:    <Usb size={ICON_SIZE} />,
  settings:   <Settings size={ICON_SIZE} />,
  tools:      <Bug size={ICON_SIZE} />,
  builder:    <Wrench size={ICON_SIZE} />,
  benchmark:  <Gauge size={ICON_SIZE} />,
  community:  <Users size={ICON_SIZE} />,
};

function PanelWrapper({ deviceId }: { deviceId: string }) {
  const multiplex = useMultiplexConnection(true);
  useMonitoringStoreBridge(multiplex);
  return (
    <MultiplexContext.Provider value={multiplex}>
      <PanelApp deviceId={deviceId} />
    </MultiplexContext.Provider>
  );
}

// Iframe-only entrypoint for /panel?simulator=1. The parent popup owns
// layout + theme + selection and feeds the iframe via postMessage. We
// still wire the multiplex provider so widgets that read live monitoring
// frames render with real data from the local service.
function PanelSimulatorWrapper() {
  const multiplex = useMultiplexConnection(true);
  useMonitoringStoreBridge(multiplex);
  return (
    <MultiplexContext.Provider value={multiplex}>
      <PanelSimulatorContent />
    </MultiplexContext.Provider>
  );
}

function OverlayWrapper() {
  const multiplex = useMultiplexConnection(true);
  useMonitoringStoreBridge(multiplex);
  return (
    <MultiplexContext.Provider value={multiplex}>
      <OverlayShell />
    </MultiplexContext.Provider>
  );
}

function useMonitoringStoreBridge(multiplex: ReturnType<typeof useMultiplexConnection>) {
  useEffect(() => {
    if (!multiplex) return;
    const onMonitoring = (data: unknown) =>
      monitoringStore.ingestMonitoring(data as MonitoringFrame);
    const onScreenTime = (data: unknown) =>
      monitoringStore.ingestScreenTime(data as ScreenTimeData);
    multiplex.subscribe('monitoring', onMonitoring);
    multiplex.subscribe('screentime', onScreenTime);
    fetchService<{ msg: string }>('/system/memory/total').then(data => {
      if (data?.msg) {
        const match = data.msg.match(/([\d.]+)\s*(GB|MB)/i);
        if (match) {
          const val = parseFloat(match[1]);
          monitoringStore.setSystemMemMb(match[2].toUpperCase() === 'GB' ? val * 1024 : val);
        }
      }
    });
    return () => {
      multiplex.unsubscribe('monitoring', onMonitoring);
      multiplex.unsubscribe('screentime', onScreenTime);
    };
  }, [multiplex]);
}

export default function App() {
  if (shouldForcePhonePanelRoute()) {
    // Standalone PWA was launched outside /panel - redirect into the panel
    // shell. The cached deviceId (if any) will move the user straight to
    // /panel/<id>; otherwise the alloc flow runs and lands them on a fresh
    // device record.
    window.history.replaceState(null, '', `${window.location.origin}/panel`);
  }

  // /r/pair is the Universal Link target on nexusqos.com. iOS opens the
  // Qos app directly when installed; otherwise this landing page
  // offers App Store + LAN-redirect fallbacks.
  if (window.location.pathname === '/r/pair') {
    return <PairRedirect />;
  }

  // /overlay is hosted by qos-overlay.exe (transparent layered window
  // per monitor). Loads with ?monitor=N&token=... so each overlay renders
  // its own slice of the shared overlayLayout.
  if (window.location.pathname === '/overlay') {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      localStorage.setItem('qos_token', urlToken);
      params.delete('token');
      const query = params.toString();
      window.history.replaceState(
        null,
        '',
        `${window.location.origin}${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
      );
    }
    return (
      <I18nProvider>
        <OverlayWrapper />
      </I18nProvider>
    );
  }

  // Panel routes:
  //   /panel/<deviceId>  - canonical, opens the panel for that device record.
  //   /panel             - allocate (or recover from cache), then redirect.
  //   /panel/phone[?pair=]   - phone pair flow; allocates a record on success.
  //   /panel/q60         - legacy: maps to a fresh allocation tagged surface=q60.
  //   /touch             - legacy alias for /panel.
  const path = window.location.pathname;
  const isPanelPath = path === '/panel'
    || path === '/touch'
    || path.startsWith('/panel/');
  if (isPanelPath) {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      localStorage.setItem('qos_token', urlToken);
      params.delete('token');
      const query = params.toString();
      window.history.replaceState(
        null,
        '',
        `${window.location.origin}${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
      );
    }
    // Simulator iframe entrypoint: PanelDevicePopup loads /panel?simulator=1
    // and feeds layout + theme over postMessage. Skip the device-allocation
    // pairing flow entirely - the simulator has no deviceId.
    if (params.get(SIMULATOR_QUERY_FLAG) === '1') {
      return (
        <I18nProvider>
          <PanelSimulatorWrapper />
        </I18nProvider>
      );
    }
    const segments = path.split('/').filter(Boolean);
    const second = segments[1];
    const isPhonePair = second === 'phone';
    const explicitDeviceId = second && !RESERVED_PANEL_PATH_SEGMENTS.has(second) ? second : null;
    return (
      <I18nProvider>
        <PanelEntrypoint
          initialDeviceId={explicitDeviceId}
          isPhonePair={isPhonePair}
          pairToken={params.get('pair')}
        />
      </I18nProvider>
    );
  }

  return (
    <I18nProvider>
      <Dashboard />
    </I18nProvider>
  );
}

type PanelFailureKind = 'auth' | 'network' | 'pair-expired';
type PanelEntrypointState = 'claiming' | 'allocating' | 'ready' | 'failed';

function PanelEntrypoint({ initialDeviceId, isPhonePair, pairToken }: {
  initialDeviceId: string | null;
  isPhonePair: boolean;
  pairToken: string | null;
}) {
  const needsPhoneClaim = isPhonePair && Boolean(pairToken);
  const [state, setState] = useState<PanelEntrypointState>(() =>
    needsPhoneClaim
      ? 'claiming'
      : initialDeviceId
      ? 'ready'
      : 'allocating',
  );
  const [deviceId, setDeviceId] = useState<string | null>(initialDeviceId);
  const [failureKind, setFailureKind] = useState<PanelFailureKind>('network');
  const [failureDetail, setFailureDetail] = useState('');
  const [allocAttempt, setAllocAttempt] = useState(0);
  const inferredSurface = useMemo(() => inferSurfaceFromViewport(isPhonePair), [isPhonePair]);

  // Phone pair flow: claim the QR token, store the session cookie, then fall
  // through to allocate-or-cache a deviceId for this phone.
  useEffect(() => {
    if (!needsPhoneClaim || !pairToken) return;
    let cancelled = false;
    claimPanelPhonePairing(pairToken).then(result => {
      if (cancelled) return;
      if (result?.paired && result.token) {
        storePhoneToken(result.token);
        localStorage.setItem(PHONE_PANEL_PWA_KEY, '1');
        // Strip the pair token from the URL but stay on /panel/phone for the
        // alloc step below, which will then redirect to /panel/<id>.
        const cleanUrl = `${window.location.origin}/panel/phone`;
        window.history.replaceState(null, '', cleanUrl);
        setState('allocating');
      } else {
        setFailureKind('pair-expired');
        setFailureDetail(result?.error || '');
        setState('failed');
      }
    });
    return () => { cancelled = true; };
  }, [needsPhoneClaim, pairToken]);

  // Allocate-or-recover flow: when no deviceId is in the URL, look for one in
  // localStorage (Option A: device caches its own id). Allocate a fresh one
  // if not found, then redirect to the canonical /panel/<id> URL.
  useEffect(() => {
    if (state !== 'allocating') return;
    let cancelled = false;
    const cached = localStorage.getItem(PANEL_DEVICE_ID_KEY);
    const finish = (id: string) => {
      if (cancelled) return;
      localStorage.setItem(PANEL_DEVICE_ID_KEY, id);
      setDeviceId(id);
      const target = `${window.location.origin}/panel/${encodeURIComponent(id)}`;
      window.history.replaceState(null, '', target);
      setState('ready');
    };
    if (cached) {
      // Trust the cache; if the server has forgotten this device the panel
      // page will 404 the device fetch and PanelApp re-allocates from there.
      finish(cached);
      return;
    }
    allocatePanelDeviceWithStatus({ surface: inferredSurface }).then(result => {
      if (cancelled) return;
      if (result.ok) {
        finish(result.record.id);
        return;
      }
      // 401 = no auth context at all (no service token, no phone cookie).
      // 403 = phone session cookie present but server denied; also a
      // not-yet-paired symptom in practice.
      const kind: PanelFailureKind = result.status === 401 || result.status === 403 ? 'auth' : 'network';
      setFailureKind(kind);
      setFailureDetail(result.status ? `HTTP ${result.status}` : 'Network error');
      setState('failed');
    });
    return () => { cancelled = true; };
  }, [state, inferredSurface, allocAttempt]);

  const retry = useCallback(() => {
    setFailureDetail('');
    setAllocAttempt(n => n + 1);
    setState('allocating');
  }, []);

  if (state === 'claiming') {
    return <div className={styles.panelPairGate}>Pairing phone...</div>;
  }
  if (state === 'allocating') {
    return <div className={styles.panelPairGate}>Registering panel...</div>;
  }
  if (state === 'failed') {
    return (
      <PanelEntrypointFailure
        kind={failureKind}
        detail={failureDetail}
        isPhone={inferredSurface === 'phone' || isPhonePair}
        onRetry={retry}
      />
    );
  }
  if (!deviceId) {
    return <div className={styles.panelPairGate}>No device id</div>;
  }
  return <PanelWrapper deviceId={deviceId} />;
}

function PanelEntrypointFailure({ kind, detail, isPhone, onRetry }: {
  kind: PanelFailureKind;
  detail: string;
  isPhone: boolean;
  onRetry: () => void;
}) {
  let headline = 'Could not register this panel';
  let body = '';
  if (kind === 'auth') {
    headline = isPhone ? 'Pair this phone first' : 'This panel needs to be authorized';
    body = isPhone
      ? 'On your PC, open the Qos dashboard, tap "Pair Phone" in the sidebar, and scan the QR code with this phone. Then tap Retry below.'
      : 'Open this URL with a service token (?token=...), or load it from the local machine where qos-service is running.';
  } else if (kind === 'pair-expired') {
    headline = 'Pairing expired';
    body = 'Generate a new QR from the Qos dashboard ("Pair Phone") and scan it again.';
  } else {
    headline = 'Could not reach the service';
    body = 'Check that qos-service is running, then retry.';
  }

  return (
    <div className={styles.panelPairGate}>
      <div className={styles.panelPairGateCard}>
        <h2 className={styles.panelPairGateTitle}>{headline}</h2>
        <p className={styles.panelPairGateBody}>{body}</p>
        {detail && <p className={styles.panelPairGateDetail}>{detail}</p>}
        <button type="button" className={styles.panelPairGateRetry} onClick={onRetry}>
          Retry
        </button>
      </div>
    </div>
  );
}

function shouldForcePhonePanelRoute() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  if (!standalone) return false;
  if (window.location.pathname.startsWith('/panel')) return false;
  return localStorage.getItem(PHONE_PANEL_PWA_KEY) === '1';
}

function QosLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Chip body */}
      <rect x="6" y="4" width="20" height="24" rx="3" fill="currentColor" />
      {/* Pins — left */}
      <rect x="2" y="9" width="5" height="2.5" rx="0.8" fill="currentColor" />
      <rect x="2" y="14.75" width="5" height="2.5" rx="0.8" fill="currentColor" />
      <rect x="2" y="20.5" width="5" height="2.5" rx="0.8" fill="currentColor" />
      {/* Pins — right */}
      <rect x="25" y="9" width="5" height="2.5" rx="0.8" fill="currentColor" />
      <rect x="25" y="14.75" width="5" height="2.5" rx="0.8" fill="currentColor" />
      <rect x="25" y="20.5" width="5" height="2.5" rx="0.8" fill="currentColor" />
      {/* Bolt — negative space */}
      <path d="M18.5 7L10 17h5l-1.5 8L22 15h-5l1.5-8z" fill="var(--bg-elevated, #0f0f0f)" />
    </svg>
  );
}

// ── Brand area (in top nav bar) ─────────────────────────────────────────

function BrandArea({ onToggleCompact }: { onToggleCompact?: () => void }) {
  return (
    <div className={styles.brand}>
      <span className={styles.logo}><QosLogo /></span>
      <span className={styles.brandName}>QOS</span>
      {onToggleCompact && (
        <button
          type="button"
          className={styles.collapseGhost}
          onClick={onToggleCompact}
          title="Collapse sidebar"
        >
          <PanelLeftClose size={16} />
        </button>
      )}
    </div>
  );
}

// ── Service status block (in sidebar, my-computer only) ─────────────────

const ADMIN_FEATURE_KEYS = [
  'status.admin.feature.sensors',
  'status.admin.feature.fans',
  'status.admin.feature.rgb',
  'status.admin.feature.ec',
  'status.admin.feature.display',
] as const;

function ServiceStatusBlock({ status, elevation, t, compact = false }: {
  status: ReturnType<typeof useServiceStatus>;
  elevation: ProcessElevationHookState;
  t: (key: string, params?: Record<string, string | number>) => string;
  compact?: boolean;
}) {
  const isOnline = status.state === 'online';
  const isOffline = status.state === 'offline' || status.state === 'offline-installed';
  const isLimited = isOnline
    && elevation.state === 'ready'
    && elevation.elevation.supported
    && elevation.elevation.status === 'not-elevated';

  // Bump connectKey every time we transition to online so the shield + label
  // remount and replay their entry animation. Initial mount with isOnline
  // already true still plays once because the key starts at 0 and that's a
  // first-paint mount of the keyed fragment.
  const wasOnlineRef = useRef(isOnline);
  const [connectKey, setConnectKey] = useState(0);
  useEffect(() => {
    if (isOnline && !wasOnlineRef.current) {
      setConnectKey(k => k + 1);
      wasOnlineRef.current = true;
    } else if (!isOnline) {
      wasOnlineRef.current = false;
    }
  }, [isOnline]);

  // Offline (installed or never): the only useful action is to launch the
  // service. Drop the dot + "Not running" / "Not installed" label and show a
  // single primary launch button instead. The button itself communicates
  // state by being there.
  if (isOffline) {
    return (
      <div className={classNames(styles.statusBlock, styles.statusBlockAction)}>
        <ServiceLaunchButton iconOnly={compact} />
      </div>
    );
  }

  const label = isOnline
    ? (isLimited ? t('status.online-limited') : t('status.online'))
    : t('status.checking');

  return (
    <div className={classNames(styles.statusBlock, { [styles.statusBlockCompact]: compact })} title={compact ? label : undefined}>
      {isOnline ? (
        <Fragment key={connectKey}>
          {elevation.state === 'ready' ? (
            <StatusInfoShield elevation={elevation} t={t} compact={compact} animateIn />
          ) : (
            <span
              className={classNames(styles.statusBadge, styles.statusBadgeOk, styles.statusBadgeAnimateIn)}
              aria-hidden
            >
              <ShieldCheck size={14} />
            </span>
          )}
          {!compact && (
            <span className={classNames(styles.statusLabel, styles.statusLabelAnimateIn)}>
              {label}
            </span>
          )}
        </Fragment>
      ) : (
        <>
          <div className={classNames(styles.statusDot, styles.checking)} />
          {!compact && <span className={styles.statusLabel}>{label}</span>}
        </>
      )}
    </div>
  );
}

// Shield badge that's clickable in both elevated (green) and not-elevated
// (yellow) states. Each state opens a small popover anchored under the
// badge: green confirms a secure connection, yellow lists the disabled
// hardware features and offers a one-click "Restart as administrator".
// Unsupported platforms (mac/Linux) render a static green badge with a
// tooltip - no popover, since admin elevation doesn't apply.
function StatusInfoShield({ elevation, t, compact, animateIn = false }: {
  elevation: Extract<ProcessElevationHookState, { state: 'ready' }>;
  t: (key: string, params?: Record<string, string | number>) => string;
  compact: boolean;
  animateIn?: boolean;
}) {
  const supported = elevation.elevation.supported;
  const isElevated = elevation.elevation.isElevated;

  const [open, setOpen] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const handleRestart = useCallback(async () => {
    if (restarting) return;
    setRestarting(true);
    const result = await elevation.relaunch();
    if (result === 'started') return;
    setRestarting(false);
  }, [elevation, restarting]);

  // Static badge for unsupported platforms (mac/Linux): no popover needed.
  if (!supported) {
    return (
      <span
        className={classNames(
          styles.statusBadge,
          styles.statusBadgeOk,
          { [styles.statusBadgeAnimateIn]: animateIn },
        )}
        title={t('status.admin.elevated')}
        aria-label={t('status.admin.elevated')}
        role="img"
      >
        <ShieldCheck size={14} />
      </span>
    );
  }

  const tone = isElevated ? styles.statusBadgeOk : styles.statusBadgeWarn;
  const triggerLabel = isElevated ? t('status.admin.elevated') : t('status.admin.notElevated');

  return (
    <div className={styles.statusBadgeWrap} ref={wrapperRef}>
      <button
        type="button"
        className={classNames(
          styles.statusBadge,
          styles.statusBadgeBtn,
          tone,
          { [styles.statusBadgeAnimateIn]: animateIn },
        )}
        onClick={() => setOpen(o => !o)}
        title={triggerLabel}
        aria-label={triggerLabel}
        aria-expanded={open}
      >
        {isElevated ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
      </button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={wrapperRef}
        placement={compact ? 'right-start' : 'bottom-start'}
        ariaLabel={triggerLabel}
      >
        {isElevated ? (
          <>
            <div className={classNames(styles.shieldPopoverHeader, styles.shieldPopoverHeaderOk)}>
              <ShieldCheck size={16} />
              <span>{t('status.connected.title')}</span>
            </div>
            <p className={styles.shieldPopoverIntro}>{t('status.connected.body')}</p>
          </>
        ) : (
          <>
            <div className={styles.shieldPopoverHeader}>
              <ShieldAlert size={16} />
              <span>{t('status.admin.popoverTitle')}</span>
            </div>
            <p className={styles.shieldPopoverIntro}>{t('status.admin.popoverIntro')}</p>
            <ul className={styles.shieldPopoverList}>
              {ADMIN_FEATURE_KEYS.map(key => (
                <li key={key}>{t(key)}</li>
              ))}
            </ul>
            <Button
              type="button"
              tone="accent"
              size="sm"
              onClick={handleRestart}
              disabled={restarting}
              loading={restarting}
            >
              {restarting ? t('status.admin.relaunching') : t('status.admin.relaunch')}
            </Button>
          </>
        )}
      </Popover>
    </div>
  );
}

// ── Sidebar footer (debug + version) ────────────────────────────────────────

function SidebarFooter({ active, onDebug, debugIcon, compact }: {
  active: boolean;
  onDebug: () => void;
  debugIcon: ReactNode;
  compact: boolean;
}) {
  return (
    <div className={classNames(styles.footer, { [styles.footerCompact]: compact })}>
      <Button
        type="button"
        tone={active ? 'accent' : 'ghost'}
        size="sm"
        icon={debugIcon}
        onClick={onDebug}
        title="Tools"
        aria-label="Tools"
        aria-pressed={active}
      />

      {!compact && <span className={styles.version}>{__APP_VERSION__}</span>}
    </div>
  );
}

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

function formatConnectedDevices(count: number, t: TranslateFn) {
  return t(count === 1 ? 'phonePair.connectedDeviceOne' : 'phonePair.connectedDeviceOther', { count });
}

function formatRelativeTime(value: number, now: number, t: TranslateFn) {
  if (!value) return t('phonePair.unknown');
  const diff = Math.max(0, now - value);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < 30_000) return t('phonePair.timeJustNow');
  if (diff < minute) return t('phonePair.timeLessThanMinuteAgo');
  if (diff < hour) return t('phonePair.timeMinutesAgo', { count: Math.floor(diff / minute) });
  if (diff < day) return t('phonePair.timeHoursAgo', { count: Math.floor(diff / hour) });
  return t('phonePair.timeDaysAgo', { count: Math.floor(diff / day) });
}

function formatElapsedTime(value: number, now: number, t: TranslateFn) {
  if (!value) return t('phonePair.unknown');
  const diff = Math.max(0, now - value);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return t('phonePair.durationLessThanMinute');
  if (diff < hour) return t('phonePair.durationMinutes', { count: Math.floor(diff / minute) });
  if (diff < day) {
    return t('phonePair.durationHoursMinutes', {
      hours: Math.floor(diff / hour),
      minutes: Math.floor((diff % hour) / minute),
    });
  }
  return t('phonePair.durationDaysHours', {
    days: Math.floor(diff / day),
    hours: Math.floor((diff % day) / hour),
  });
}

function formatDateTime(value: number, t: TranslateFn) {
  if (!value) return t('phonePair.unknown');
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function PairPhoneButton({ connectedCount, disabled, compact, onClick }: {
  connectedCount: number;
  disabled: boolean;
  compact: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const connected = connectedCount > 0;
  const countLabel = formatConnectedDevices(connectedCount, t);
  return (
    <div className={classNames(styles.phonePairWrap, { [styles.phonePairWrapCompact]: compact })}>
      <button
        type="button"
        className={classNames(styles.phonePairBtn, { [styles.phonePairBtnCompact]: compact })}
        onClick={onClick}
        disabled={disabled}
        title={compact ? `${t('phonePair.title')} · ${countLabel}` : undefined}
      >
        <span className={styles.phonePairIcon}>
          <Smartphone size={16} />
          <span className={classNames(styles.phonePairDot, { [styles.phonePairDotOn]: connected })} />
        </span>
        {!compact && (
          <>
            <span>{t('phonePair.title')}</span>
            <span className={styles.phonePairState}>{countLabel}</span>
          </>
        )}
      </button>
    </div>
  );
}

function PairPhoneModal({ open, connectedCount, onClose }: {
  open: boolean;
  connectedCount: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [qr, setQr] = useState<PanelPhonePairQr | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<PanelPhoneSessionsResponse | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [confirmRemoveAllOpen, setConfirmRemoveAllOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const refreshInFlightRef = useRef(false);
  const sessionsInFlightRef = useRef(false);

  const refresh = useCallback(() => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    setLoading(true);
    fetchPanelPhonePairQr().then(next => {
      setQr(next);
      setNow(Date.now());
    }).finally(() => {
      refreshInFlightRef.current = false;
      setLoading(false);
    });
  }, []);

  const loadSessions = useCallback((showLoading = false) => {
    if (sessionsInFlightRef.current) return;
    sessionsInFlightRef.current = true;
    if (showLoading) setSessionsLoading(true);
    fetchPanelPhoneSessions().then(next => {
      if (next) setSessions(next);
    }).finally(() => {
      sessionsInFlightRef.current = false;
      if (showLoading) setSessionsLoading(false);
    });
  }, []);

  const revokeSession = useCallback(async (id: string) => {
    setRevokingId(id);
    await revokePanelPhoneSession(id);
    await fetchPanelPhoneSessions().then(next => {
      if (next) setSessions(next);
    });
    setRevokingId(null);
  }, []);

  const renameSession = useCallback((id: string, name: string) => {
    setRenamingId(id);
    setSessions(current => current
      ? {
          ...current,
          sessions: current.sessions.map(session =>
            session.id === id ? { ...session, name } : session),
        }
      : current);
    void renamePanelPhoneSession(id, name)
      .finally(() => {
        setRenamingId(null);
        loadSessions(false);
      });
  }, [loadSessions]);

  const revokeAllSessions = useCallback(() => {
    setConfirmRemoveAllOpen(false);
    setSessions(current => current
      ? { ...current, authorizedCount: 0, sessions: [] }
      : current);
    void revokeAllPanelPhoneSessions()
      .finally(() => loadSessions(false));
  }, [loadSessions]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      refresh();
      loadSessions(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, loadSessions, refresh]);

  useEffect(() => {
    if (open) return;
    const timer = window.setTimeout(() => setConfirmRemoveAllOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => loadSessions(false), 3000);
    return () => window.clearInterval(timer);
  }, [loadSessions, open]);

  useEffect(() => {
    if (!open || !qr) return;
    const msUntilRefresh = Math.max(1000, qr.expiresAt - Date.now());
    const timer = window.setTimeout(refresh, msUntilRefresh);
    return () => window.clearTimeout(timer);
  }, [open, qr, refresh]);

  if (!open) return null;

  const secondsLeft = qr ? Math.max(0, Math.ceil((qr.expiresAt - now) / 1000)) : 0;
  const qrStatus = loading || secondsLeft <= 0
    ? t('phonePair.refreshing')
    : t('phonePair.refreshesIn', { seconds: secondsLeft });
  const liveConnectedCount = sessions?.connectedCount ?? connectedCount;
  const sessionNow = sessions?.now ?? now;
  const sessionList = sessions?.sessions ?? [];

  return (
    <>
      <DevicePopup open={open} onClose={onClose} title={t('phonePair.title')} icon={<Smartphone size={18} />}>
        <div className={styles.phonePairContent}>
          <p className={styles.phonePairIntro}>
            {t('phonePair.intro')}
          </p>

          <section className={styles.phonePairQrPanel} aria-label={t('phonePair.ariaQr')}>
            <div className={styles.phonePairQrBox}>
              {qr?.qrDataUrl && !loading ? (
                <img src={qr.qrDataUrl} alt={t('phonePair.qrAlt')} />
              ) : (
                <div className={styles.phonePairLoading}>{t('phonePair.loadingQr')}</div>
              )}
            </div>
            <div className={styles.phonePairMeta}>
              <span>{qrStatus}</span>
            </div>
            <p className={styles.phonePairSecurityNote}>
              {t('phonePair.securityNote')}
            </p>
          </section>

          <section className={styles.phonePairSessionsPanel} aria-label={t('phonePair.ariaSessions')}>
            <div className={styles.phonePairSessionsHeader}>
              <div>
                <h3>{t('phonePair.authorizedDevices')}</h3>
                <span>{formatConnectedDevices(liveConnectedCount, t)}</span>
              </div>
              <button
                type="button"
                className={styles.phonePairRevoke}
                disabled={sessionList.length === 0}
                onClick={() => setConfirmRemoveAllOpen(true)}
              >
                <LogOut size={14} />
                {t('phonePair.removeAll')}
              </button>
            </div>

            {sessionsLoading && sessionList.length === 0 ? (
              <div className={styles.phonePairEmpty}>{t('phonePair.loadingSessions')}</div>
            ) : sessionList.length === 0 ? (
              <div className={styles.phonePairEmpty}>{t('phonePair.emptySessions')}</div>
            ) : (
              <div className={styles.phonePairSessionList}>
                {sessionList.map(session => {
                  const fallbackName = t('phonePair.deviceFallback');
                  const deviceType = session.deviceType || '';
                  const persistedName = session.name || '';
                  const hasCustomName = Boolean(persistedName && persistedName !== fallbackName && persistedName !== deviceType);
                  const sessionName = hasCustomName ? persistedName : deviceType || persistedName || fallbackName;
                  const showDeviceType = Boolean(session.deviceType && session.deviceType !== sessionName);
                  return (
                    <div key={session.id} className={styles.phonePairSessionRow}>
                      <span className={styles.phonePairSessionIcon}>
                        <Smartphone size={15} />
                      </span>
                      <div className={styles.phonePairSessionMain}>
                        <div className={styles.phonePairSessionTitleRow}>
                          <EditableText
                            value={sessionName}
                            onCommit={name => renameSession(session.id, name)}
                            maxLength={40}
                            className={styles.phonePairSessionName}
                            ariaLabel={t('phonePair.editDeviceName')}
                          />
                          <span
                            className={classNames(styles.phonePairSessionBadge, {
                              [styles.phonePairSessionBadgeActive]: session.recentlyActive,
                            })}
                          >
                            {session.recentlyActive ? t('phonePair.statusRecentlyActive') : t('phonePair.statusPaired')}
                          </span>
                          {renamingId === session.id && (
                            <span className={styles.phonePairSessionSaving}>{t('phonePair.saving')}</span>
                          )}
                        </div>
                        <div className={styles.phonePairSessionMeta} title={session.userAgent || undefined}>
                          {showDeviceType && <span>{deviceType}</span>}
                          <span>{t('phonePair.lastSeen', { time: formatRelativeTime(session.lastSeenAt, sessionNow, t) })}</span>
                          <span>{t('phonePair.pairedAt', { time: formatDateTime(session.createdAt, t) })}</span>
                          <span>{t('phonePair.authorizedDuration', { duration: formatElapsedTime(session.createdAt, sessionNow, t) })}</span>
                          <span>{session.remoteAddress || t('phonePair.unknownIp')}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className={classNames(styles.phonePairRevoke, styles.phonePairSessionRevoke)}
                        disabled={revokingId === session.id}
                        onClick={() => revokeSession(session.id)}
                        aria-label={t('phonePair.removeSession', { name: sessionName })}
                        title={t('phonePair.removeSession', { name: sessionName })}
                      >
                        <LogOut size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </DevicePopup>
      <ConfirmDialog
        open={confirmRemoveAllOpen}
        title={t('phonePair.confirmRemoveAllTitle')}
        message={t('phonePair.confirmRemoveAllMessage')}
        note={t('phonePair.confirmRemoveAllNote')}
        confirmLabel={t('phonePair.removeAll')}
        onConfirm={revokeAllSessions}
        onCancel={() => setConfirmRemoveAllOpen(false)}
      />
    </>
  );
}

// ── Dashboard ───────────────────────────────────────────────────────────────

function Dashboard() {
  const { section, view, subtab, componentId, fromCategory, navigate, setView, setSubtab, navigateToComponent } = useRoute();
  const status = useServiceStatus();
  const online = status.state === 'online';
  const multiplex = useMultiplexConnection(online);
  const serviceState = useServiceState(online);
  const processElevation = useProcessElevation(online);
  const profilesHook = useProfiles(online);
  const { t, setLanguage } = useTranslation();

  // Builder state (needed for sidebar in builder mode)
  const { build, dispatch, issues, wattage } = useBuilder();

  // Always-on monitoring: subscribe to composite frame + screentime at app
  // level so the store keeps accumulating across tab switches. Users want
  // sparklines and history to survive navigating away from Monitoring.
  // The backend is cheap at this (CachingUsbEnumerator + de-LINQ'd
  // ProcessMonitor) and drops cadence to 2 s by default.
  useMonitoringStoreBridge(multiplex);

  // NOTE: the UiSettingsProvider below now owns the server-preferences hydrate
  // + cache + theme/accent apply. The legacy effect that did all three
  // inline used to live here; removed to keep a single source of truth.

  const handlePreferencesChanged = useCallback((ui: UiSettings) => {
    applyThemeMode(ui.themeMode as ThemeMode);
    applyAccentColor(ui.accentColor);
    if (ui.language) setLanguage(ui.language as Language);
    cachePreferencesLocally(ui);
  }, [setLanguage]);

  const handleNavigateSettings = useCallback(() => {
    navigate('my-computer', 'settings', 'profiles');
  }, [navigate]);

  const handleServiceNavChange = useCallback((key: string) => {
    if (section === 'my-computer') {
      setView(key);
    } else {
      navigate('my-computer', key);
    }
  }, [section, setView, navigate]);

  const handlePortalNavChange = useCallback((key: string) => {
    navigate(key as 'builder' | 'benchmark' | 'community');
  }, [navigate]);

  const handleViewDetail = useCallback((component: ComponentOption) => {
    const currentCategory = section === 'builder' && view && view !== 'component' ? view : null;
    // Prefer normalizedKey over the raw UUID so the URL reads as a product
    // name ("/builder/component/amd-ryzen-9-7950x") rather than a GUID. The
    // API's getComponent(category, id) matches on either, so older links to
    // the UUID form still resolve.
    const slug = component.normalizedKey || component.id;
    navigateToComponent(slug, currentCategory);
  }, [navigateToComponent, section, view]);

  const totalPrice = Object.entries(build.slots).reduce((sum, [cat, entries]) => {
    if (build.ownedSlots.includes(cat as ComponentCategory)) return sum;
    for (const entry of entries) {
      if (entry.selection?.bestPrice != null) {
        sum += entry.selection.bestPrice;
      }
    }
    return sum;
  }, 0);

  // Service nav items
  const serviceNav = SERVICE_NAV_KEYS.map(key => ({
    key,
    label: t(`nav.${key}`),
    icon: NAV_ICONS[key],
  }));

  // Portal entries (System Builder / Benchmark / Community).
  // Service build: external <a> to nexusqos.com (new tab).
  // Full build: in-app navigate (entries are real SPA routes on nexusqos.com).
  const portalNav = PORTAL_NAV_KEYS.map(key => ({
    key,
    label: t(`nav.section.${key}`),
    icon: NAV_ICONS[key],
    ...(__SERVICE_BUILD__ ? { href: `${PORTAL_URL}/${key}` } : {}),
  }));

  // Active view within my-computer section
  const activeView = view || 'dashboard';

  // In service build the sidebar is only meaningful on my-computer (the
  // PORTAL entries open nexusqos.com in a new tab and never change `section`
  // locally). In the full build sidebar must render on every section so users
  // landing on /builder, /benchmark, or /community still have nav.
  const hasSidebar = !__SERVICE_BUILD__ || section === 'my-computer';
  const serviceNavActive = section === 'my-computer' ? activeView : '';
  const portalNavActive = section !== 'my-computer' ? section : '';
  // null = auto (follow viewport), true = user-collapsed, false = user-expanded
  const [manualOverride, setManualOverride] = useState<boolean | null>(null);
  const [pairPhoneOpen, setPairPhoneOpen] = useState(false);
  const [viewportNarrow, setViewportNarrow] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 999px)').matches,
  );
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 999px)');
    const handler = (e: MediaQueryListEvent) => setViewportNarrow(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  const sidebarCompact = manualOverride ?? viewportNarrow;
  const compact = hasSidebar && sidebarCompact;

  // ── Render main content based on section + view ────────────────────────
  const renderContent = () => {
    switch (section) {
      case 'my-computer':
        return renderMyComputerView();
      case 'builder':
        // Component detail page
        if (view === 'component' && componentId) {
          return (
            <ComponentDetailView
              componentId={componentId}
              category={fromCategory as ComponentCategory | undefined}
              dispatch={dispatch}
              onBack={() => navigate('builder', fromCategory ?? undefined)}
            />
          );
        }
        return (
          <Suspense fallback={<Placeholder title={t('nav.section.builder')} />}>
            <BuilderView
              category={(view as ComponentCategory) || null}
              build={build}
              dispatch={dispatch}
              issues={issues}
              wattage={wattage}
              totalPrice={totalPrice}
              onCategoryChange={(cat) => {
                if (cat) {
                  setView(cat);
                } else {
                  navigate('builder');
                }
              }}
              onViewDetail={handleViewDetail}
            />
          </Suspense>
        );
      case 'benchmark':
        return (
          <BenchmarkView
            serviceOnline={online}
            connectionState={status.state}
            onHardwareConfirmed={(detected) => {
              dispatch({ type: 'LOAD_OWNED_HARDWARE', detected });
              navigate('builder');
            }}
          />
        );
      case 'community':
        return <Placeholder title={t('nav.section.community')} />;
      default:
        return <Placeholder title={section} />;
    }
  };

  const renderMyComputerView = () => {
    switch (activeView) {
      case 'dashboard':  return <DashboardView serviceOnline={online} connectionState={status.state} onSectionNavigate={setView} />;
      case 'monitoring': return <MonitoringView serviceOnline={online} connectionState={status.state} tab={subtab} onTabChange={setSubtab} />;
      case 'lighting':   return <LightingView serviceOnline={online} connectionState={status.state} activeProfileId={profilesHook.activeId} />;
      case 'cooling':    return <CoolingView serviceOnline={online} serviceState={serviceState} connectionState={status.state} activeProfileId={profilesHook.activeId} />;
      case 'devices':    return <DevicesView serviceOnline={online} connectionState={status.state} />;
      case 'tools':      return <ToolsView serviceOnline={online} connectionState={status.state} />;
      case 'settings':   return <SettingsView serviceOnline={online} connectionState={status.state} platform={status.ping?.platform ?? ''} tab={subtab} onTabChange={setSubtab} profiles={profilesHook} />;
      default:           return <Placeholder title={activeView} />;
    }
  };

  return (
    <MultiplexContext.Provider value={multiplex}>
      <UiSettingsProvider
        serviceOnline={online}
        activeProfileId={profilesHook.activeId}
      >
      <div className={classNames(styles.layout, { [styles.layoutCompact]: compact })}>
        {/* Top row: QOS wordmark only, full build only, hidden in compact mode */}
        {!__SERVICE_BUILD__ && !compact && (
          <div className={styles.topRow}>
            <BrandArea onToggleCompact={hasSidebar ? () => setManualOverride(!sidebarCompact) : undefined} />
          </div>
        )}

        {/* Body row: sidebar (my-computer only) + content */}
        <div className={styles.bodyRow}>
          {hasSidebar && (
            <div className={classNames(styles.sidebarColumn, { [styles.sidebarCompact]: compact })}>
              <Sidebar
                items={serviceNav}
                active={serviceNavActive}
                onChange={handleServiceNavChange}
                sectionLabel={t('nav.section.my_computer')}
                serviceState={serviceState}
                statusBlock={<ServiceStatusBlock status={status} elevation={processElevation} t={t} compact={compact} />}
                profileDropdown={
                  online ? (
                    <ProfileDropdown
                      profiles={profilesHook}
                      onPreferencesChanged={handlePreferencesChanged}
                      onNavigateSettings={handleNavigateSettings}
                      compact={compact}
                    />
                  ) : undefined
                }
                compact={compact}
                extraItems={portalNav}
                extraSectionLabel={t('nav.group.portal')}
                extraActive={portalNavActive}
                extraOnChange={handlePortalNavChange}
              />
              <PairPhoneButton
                connectedCount={serviceState.panel?.phoneSubscribers ?? 0}
                disabled={!online}
                compact={compact}
                onClick={() => setPairPhoneOpen(true)}
              />
              <SidebarFooter
                active={activeView === 'tools'}
                onDebug={() => navigate('my-computer', 'tools')}
                debugIcon={NAV_ICONS['tools']}
                compact={compact}
              />
              <PairPhoneModal
                open={pairPhoneOpen}
                connectedCount={serviceState.panel?.phoneSubscribers ?? 0}
                onClose={() => setPairPhoneOpen(false)}
              />
              <button
                type="button"
                className={styles.collapseEdge}
                onClick={() => setManualOverride(!sidebarCompact)}
                aria-label={compact ? t('sidebar.expand') : t('sidebar.collapse')}
                title={compact ? t('sidebar.expand') : t('sidebar.collapse')}
              />
            </div>
          )}

          <div className={styles.mainColumn}>
            <div className={styles.content}>
              <ErrorBoundary key={`${section}/${view}`}>{renderContent()}</ErrorBoundary>
            </div>
          </div>
        </div>
      </div>
      </UiSettingsProvider>
    </MultiplexContext.Provider>
  );
}
