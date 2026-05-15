import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense, type ReactNode } from 'react';
import {
  Activity, LayoutDashboard, Lightbulb, Fan, Settings,
  Bug, Usb, PanelLeftClose, Smartphone,
  LogOut,
  Wrench, Gauge, Users,
} from 'lucide-react';
import classNames from 'classnames';
import { Sidebar } from './components/Sidebar/Sidebar';
import { Button } from './components/Button/Button';
import { ProfileDropdown } from './components/ProfileDropdown/ProfileDropdown';
import { DeviceModal } from './components/DeviceModal/DeviceModal';
import { ConfirmModal } from './components/ConfirmModal/ConfirmModal';
import { EditableText } from './components/Editable/EditableText';
import { Toggle } from './components/Toggle/Toggle';
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
import { WidgetReferenceWrapper } from './widgets/reference/WidgetReference';
import { SnapshotHarness } from './__snapshots__/legacy-weather/SnapshotHarness';
import { OpenInAppBanner } from './components/OpenInAppBanner';
import { ConflictWarningBadge } from './components/Sidebar/ConflictWarning';
import { ToolsView } from './components/views/ToolsView';
import { SettingsView } from './components/views/SettingsView';
import { DevicesView } from './components/views/DevicesView/DevicesView';
import { LightingView } from './components/views/LightingView';
import { loadMarketplaceWidgets } from './widgets/marketplaceRegistry';
import { useServiceStatus, type ConnectionState } from './hooks/useServiceStatus';
import { useServiceState } from './hooks/useServiceState';
import { useProfiles } from './hooks/useProfiles';
import { useRoute } from './hooks/useRoute';
import { useBuilder } from './hooks/useBuilder';
import { fetchService } from './api/service';
import {
  allocatePanelDeviceWithStatus,
  claimPanelPhonePairing,
  fetchPanelPhonePairQr,
  fetchPanelPhoneSessions,
  fetchPanelRemoteControlState,
  renamePanelPhoneSession,
  revokeAllPanelPhoneSessions,
  revokePanelPhoneSession,
  setPanelRemoteControlEnabled,
  type PanelPhonePairQr,
  type PanelPhoneSessionsResponse,
} from './api/panel';
import { inferSurfaceFromViewport } from './panel/inferSurface';
import { storePhoneToken } from './api/auth';
import { MultiplexContext, useMultiplexConnection } from './hooks/useMultiplexSocket';
import { UiSettingsProvider, useUiSettings } from './hooks/useUiSettings';
import { useConflictApps } from './hooks/useConflictApps';
import * as monitoringStore from './lib/monitoringStore';
import type { MonitoringFrame } from './hooks/useMonitoringFrame';
import type { ScreenTimeData } from './hooks/useScreenTime';
import { useTranslation, I18nProvider } from './lib/i18n';
import { applyThemeMode, applyAccentColor, cachePreferencesLocally } from './lib/settings';
import type { Preferences } from './api/profiles';
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

// Iframe-only entrypoint for /panel?simulator=1. The parent modal owns
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

  // Declarative widget UI reference. A storybook-style catalog of every
  // meter type plus the binding cheatsheet. Lets widget authors see what
  // tags / props / variants are available without trawling the source.
  if (window.location.pathname === '/widget-reference') {
    return (
      <I18nProvider>
        <WidgetReferenceWrapper />
      </I18nProvider>
    );
  }

  // Snapshot harness for widget visual-parity work. Renders the
  // legacy + declarative versions side-by-side with identical mocked
  // data; Playwright takes pixel screenshots so we can iterate on the
  // declarative manifest until visual fidelity matches.
  if (window.location.pathname === '/snapshot-harness') {
    return (
      <I18nProvider>
        <SnapshotHarness />
      </I18nProvider>
    );
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
    // Simulator iframe entrypoint: PanelDeviceModal loads /panel?simulator=1
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

function QosWordmark({ height = 40 }: { height?: number }) {
  const width = Math.round((height * 749) / 352);
  return (
    <svg width={width} height={height} viewBox="0 0 749 352" fill="currentColor" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Nexus Qos">
      <g transform="translate(0,352) scale(0.1,-0.1)">
        <path d="M4602 3505 c-107 -33 -164 -121 -142 -219 16 -73 71 -110 214 -145 49 -12 101 -28 116 -36 68 -35 44 -110 -40 -125 -60 -11 -149 3 -211 34 -28 15 -53 25 -54 24 -15 -17 -44 -91 -40 -98 12 -20 89 -52 159 -66 111 -24 238 -1 300 54 28 25 56 92 56 135 0 94 -52 139 -214 182 -102 27 -136 40 -148 59 -15 22 -8 53 18 77 23 21 35 24 102 23 57 0 90 -6 126 -22 27 -12 50 -22 51 -22 3 0 45 96 45 103 0 6 -71 35 -115 47 -55 14 -171 12 -223 -5z" />
        <path d="M0 3190 l0 -320 65 0 65 0 0 208 1 207 32 -36 c17 -19 95 -113 171 -207 l139 -173 56 3 56 3 0 315 0 315 -67 3 -68 3 -2 -201 -3 -201 -163 201 -163 200 -59 0 -60 0 0 -320z" />
        <path d="M1190 3190 l0 -320 245 0 245 0 0 55 c0 37 -4 55 -12 55 -7 1 -86 0 -175 0 l-163 -1 0 81 0 80 150 0 150 0 0 55 0 55 -150 0 -150 0 0 75 0 75 170 0 170 0 0 55 0 55 -240 0 -240 0 0 -320z" />
        <path d="M2222 3467 c141 -191 188 -257 188 -269 0 -7 -50 -80 -110 -161 -61 -82 -110 -153 -110 -158 0 -5 31 -9 70 -9 l70 0 53 73 c29 39 67 92 84 115 l31 44 82 -116 82 -116 80 0 80 0 -38 53 c-21 28 -75 103 -121 165 -50 67 -81 118 -76 125 3 7 46 64 94 128 47 63 94 128 104 142 l17 27 -75 0 -75 0 -73 -100 c-40 -55 -77 -99 -81 -98 -5 2 -40 46 -77 98 l-68 95 -82 3 -82 3 33 -44z" />
        <path d="M3322 3278 l3 -233 29 -52 c35 -63 84 -98 168 -119 107 -28 231 1 296 69 61 63 75 114 79 287 2 85 0 183 -3 218 l-6 62 -63 0 -64 0 -3 -212 c-3 -245 -9 -266 -81 -299 -53 -24 -91 -24 -144 0 -72 33 -77 54 -81 299 l-4 212 -65 0 -64 0 3 -232z" />
        <path d="M585 2340 c-298 -44 -518 -248 -571 -530 -23 -120 -15 -570 10 -650 39 -119 88 -202 166 -280 89 -89 163 -134 273 -169 l82 -25 600 -6 c386 -4 611 -10 630 -17 99 -35 179 -104 216 -188 16 -35 24 -81 29 -160 9 -130 31 -187 92 -240 47 -39 109 -63 191 -72 l58 -6 -3 909 -3 909 -28 81 c-31 95 -105 212 -166 267 -105 95 -246 158 -394 177 -84 11 -1108 11 -1182 0z m1233 -364 c73 -34 124 -86 161 -165 25 -54 26 -63 29 -273 3 -179 1 -227 -13 -274 -39 -135 -135 -219 -276 -244 -43 -7 -233 -10 -579 -8 -509 3 -516 3 -571 26 -72 29 -143 91 -174 151 -39 78 -48 151 -43 362 5 218 17 270 82 345 35 41 118 92 170 105 17 4 283 6 591 6 l560 -2 63 -29z" />
        <path d="M3325 2340 c-298 -44 -518 -248 -571 -530 -23 -120 -15 -570 10 -650 39 -119 88 -202 166 -280 89 -89 162 -134 273 -169 l82 -25 593 -4 c643 -3 693 0 823 52 174 71 316 230 372 418 20 68 22 93 22 368 l0 295 -28 81 c-31 94 -105 212 -166 267 -105 95 -246 158 -394 177 -84 11 -1108 11 -1182 0z m1233 -364 c73 -34 124 -86 161 -165 25 -54 26 -63 29 -273 3 -179 1 -227 -13 -274 -39 -135 -135 -219 -276 -244 -43 -7 -233 -10 -579 -8 -509 3 -516 3 -571 26 -72 29 -143 91 -174 151 -39 78 -48 151 -43 362 5 218 17 270 82 345 35 41 118 92 170 105 17 4 283 6 591 6 l560 -2 63 -29z" />
        <path d="M5892 2339 c-201 -34 -362 -180 -407 -370 -66 -282 102 -543 391 -604 55 -12 171 -15 592 -15 569 0 564 0 624 -57 77 -74 54 -206 -46 -261 -28 -15 -93 -17 -701 -22 -630 -5 -672 -6 -708 -24 -80 -40 -138 -142 -141 -250 l-1 -51 755 -3 c528 -2 776 1 823 9 42 7 100 27 147 50 350 175 357 692 12 872 -119 62 -98 60 -722 66 -557 6 -576 7 -610 27 -55 32 -80 77 -80 143 0 70 24 113 79 141 39 19 56 20 632 20 535 0 598 2 648 17 109 34 182 139 185 267 l1 51 -710 1 c-390 1 -734 -2 -763 -7z" />
      </g>
    </svg>
  );
}

function QosMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 236 235" fill="currentColor" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Qos">
      <g transform="translate(0,235) scale(0.1,-0.1)">
        <path d="M585 2340 c-298 -44 -518 -248 -571 -530 -23 -120 -15 -570 10 -650 39 -119 88 -202 166 -280 89 -89 163 -134 273 -169 l82 -25 600 -6 c386 -4 611 -10 630 -17 99 -35 179 -104 216 -188 16 -35 24 -81 29 -160 9 -130 31 -187 92 -240 47 -39 109 -63 191 -72 l58 -6 -3 909 -3 909 -28 81 c-31 95 -105 212 -166 267 -105 95 -246 158 -394 177 -84 11 -1108 11 -1182 0z m1233 -364 c73 -34 124 -86 161 -165 25 -54 26 -63 29 -273 3 -179 1 -227 -13 -274 -39 -135 -135 -219 -276 -244 -43 -7 -233 -10 -579 -8 -509 3 -516 3 -571 26 -72 29 -143 91 -174 151 -39 78 -48 151 -43 362 5 218 17 270 82 345 35 41 118 92 170 105 17 4 283 6 591 6 l560 -2 63 -29z" />
      </g>
    </svg>
  );
}

// ── Sidebar brand (logo + wordmark at top of sidebar) ───────────────────

function SidebarBrand({ compact, onToggleCompact, expandLabel, collapseLabel }: {
  compact: boolean;
  onToggleCompact: () => void;
  expandLabel: string;
  collapseLabel: string;
}) {
  return (
    <div className={classNames(styles.sidebarBrand, { [styles.sidebarBrandCompact]: compact })}>
      {compact ? (
        <button
          type="button"
          className={classNames(styles.sidebarBrandLogo, styles.sidebarBrandLogoBtn)}
          onClick={onToggleCompact}
          title={expandLabel}
          aria-label={expandLabel}
        >
          <QosMark size={24} />
        </button>
      ) : (
        <>
          <span className={styles.sidebarBrandWordmark}>
            <QosWordmark height={40} />
          </span>
          <button
            type="button"
            className={styles.sidebarBrandCollapse}
            onClick={onToggleCompact}
            title={collapseLabel}
            aria-label={collapseLabel}
          >
            <PanelLeftClose size={16} />
          </button>
        </>
      )}
    </div>
  );
}

// ── Connected profile slot ──────────────────────────────────────────────

// Wraps the profile dropdown so it remounts (via `key`) every time the service
// transitions offline -> online. The remount replays the one-shot fade-in
// animation defined in App.module.scss (.connectedSlotAnimate).
function ConnectedProfileSlot({ connectEpoch, children }: {
  connectEpoch: number;
  children: ReactNode;
}) {
  return (
    <div key={connectEpoch} className={styles.connectedSlotAnimate}>
      {children}
    </div>
  );
}

// ── Not-connected badge (sits in the sidebar profile slot when offline) ──

function NotConnectedBadge({ state, t, compact }: {
  state: ConnectionState;
  t: (key: string, params?: Record<string, string | number>) => string;
  compact: boolean;
}) {
  const label = state === 'checking'
    ? t('status.checking')
    : state === 'offline-installed'
    ? t('status.offline-installed')
    : t('status.offline');
  const isChecking = state === 'checking';

  return (
    <div
      className={classNames(styles.notConnected, { [styles.notConnectedCompact]: compact })}
      title={compact ? label : undefined}
      role="status"
      aria-live="polite"
    >
      <span className={classNames(styles.notConnectedDot, { [styles.notConnectedDotChecking]: isChecking })} aria-hidden />
      {!compact && <span className={styles.notConnectedLabel}>{label}</span>}
    </div>
  );
}

// ── Sidebar footer (debug + version) ────────────────────────────────────────

/**
 * Bottom-left sidebar conflict warning slot. Reads the user's
 * <c>disableConflictAlerts</c> preference from the UiSettings context so we
 * can both gate the WebSocket subscription (no point polling when the user
 * hid the badge) and let the in-modal "Don't show again" checkbox persist
 * the flag through the same write path.
 */
function SidebarConflictSlot({ serviceOnline, compact }: {
  serviceOnline: boolean;
  compact: boolean;
}) {
  const { settings, update } = useUiSettings();
  const enabled = serviceOnline && !settings.disableConflictAlerts;
  const conflicts = useConflictApps(enabled);

  if (!enabled) return null;

  return (
    <ConflictWarningBadge
      conflicts={conflicts}
      compact={compact}
      onDismissForever={() => update({ disableConflictAlerts: true })}
    />
  );
}

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

function PairPhoneButton({ connectedCount, remoteEnabled, disabled, compact, onClick }: {
  connectedCount: number;
  remoteEnabled: boolean;
  disabled: boolean;
  compact: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const connected = connectedCount > 0;
  // remoteEnabled === false beats connected-count: when the killswitch is OFF
  // the dot becomes amber regardless of how many devices were previously paired,
  // because none of them can reach the system right now.
  const dotState: 'off' | 'paired' | 'connected' = !remoteEnabled
    ? 'paired'
    : connected ? 'connected' : 'off';
  const countLabel = remoteEnabled
    ? formatConnectedDevices(connectedCount, t)
    : t('phonePair.killswitch.offLabel');
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
          <span className={styles.phonePairDot} data-state={dotState} />
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

function PairPhoneModal({ open, connectedCount, remoteEnabled, onRemoteEnabledChange, onClose }: {
  open: boolean;
  connectedCount: number;
  remoteEnabled: boolean;
  onRemoteEnabledChange: (next: boolean) => void;
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
  const [confirmDisableOpen, setConfirmDisableOpen] = useState(false);
  const [togglingRemote, setTogglingRemote] = useState(false);
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

  const applyRemoteEnabled = useCallback(async (next: boolean) => {
    setTogglingRemote(true);
    try {
      const result = await setPanelRemoteControlEnabled(next);
      // Trust the server's confirmation only - postService returns null on
      // any non-OK response (401/403/network), and optimistically flipping
      // the UI in that case would lie until the 10s poll resyncs.
      if (result) {
        onRemoteEnabledChange(result.enabled);
        // KickAllPhoneAsync ran synchronously on the server when next=false,
        // so the connected count drops to 0 by the next sessions poll; pull
        // it now for snappy UI.
        loadSessions(false);
      }
    } finally {
      setTogglingRemote(false);
    }
  }, [loadSessions, onRemoteEnabledChange]);

  const handleRemoteToggle = useCallback((next: boolean) => {
    if (!next) {
      setConfirmDisableOpen(true);
      return;
    }
    void applyRemoteEnabled(true);
  }, [applyRemoteEnabled]);

  const confirmDisableRemote = useCallback(() => {
    setConfirmDisableOpen(false);
    void applyRemoteEnabled(false);
  }, [applyRemoteEnabled]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      if (remoteEnabled) refresh();
      loadSessions(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, loadSessions, refresh, remoteEnabled]);

  useEffect(() => {
    if (open) return;
    const timer = window.setTimeout(() => {
      setConfirmRemoveAllOpen(false);
      setConfirmDisableOpen(false);
    }, 0);
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
    if (!open || !qr || !remoteEnabled) return;
    const msUntilRefresh = Math.max(1000, qr.expiresAt - Date.now());
    const timer = window.setTimeout(refresh, msUntilRefresh);
    return () => window.clearTimeout(timer);
  }, [open, qr, refresh, remoteEnabled]);

  if (!open) return null;

  const secondsLeft = qr ? Math.max(0, Math.ceil((qr.expiresAt - now) / 1000)) : 0;
  const qrStatus = loading || secondsLeft <= 0
    ? t('phonePair.refreshing')
    : t('phonePair.refreshesIn', { seconds: secondsLeft });
  const liveConnectedCount = sessions?.connectedCount ?? connectedCount;
  const sessionNow = sessions?.now ?? now;
  const sessionList = sessions?.sessions ?? [];

  // Off-state count: prefer authorizedCount (the server's view) so we don't
  // render "0 devices paired" while sessions is still null on first open.
  const offPairedCount = sessions?.authorizedCount ?? sessionList.length;
  const sessionCountLabel = remoteEnabled
    ? formatConnectedDevices(liveConnectedCount, t)
    : sessions == null
      ? t('phonePair.loadingSessions')
      : t(
          offPairedCount === 1
            ? 'phonePair.killswitch.offSummaryOne'
            : 'phonePair.killswitch.offSummaryOther',
          { count: offPairedCount },
        );

  return (
    <>
      <DeviceModal open={open} onClose={onClose} title={t('phonePair.title')} icon={<Smartphone size={18} />}>
        <div className={styles.phonePairContent} data-remote-enabled={remoteEnabled ? 'true' : 'false'}>
          <p className={styles.phonePairIntro}>
            {t('phonePair.intro')}
          </p>

          <div className={styles.phonePairKillswitchRow}>
            <div>
              <span className={styles.phonePairKillswitchLabel} id="phone-pair-killswitch-label">
                {t('phonePair.killswitch.label')}
              </span>
              <span className={styles.phonePairKillswitchHint}>
                {remoteEnabled
                  ? t('phonePair.killswitch.onHint')
                  : t('phonePair.killswitch.offHint')}
              </span>
            </div>
            <Toggle
              checked={remoteEnabled}
              disabled={togglingRemote}
              onChange={handleRemoteToggle}
              ariaLabelledBy="phone-pair-killswitch-label"
            />
          </div>

          <section className={styles.phonePairQrPanel} aria-label={t('phonePair.ariaQr')} data-disabled={remoteEnabled ? 'false' : 'true'}>
            <div className={styles.phonePairQrBox}>
              {!remoteEnabled ? (
                <div className={styles.phonePairLoading}>{t('phonePair.killswitch.qrDisabled')}</div>
              ) : qr?.qrDataUrl && !loading ? (
                <img src={qr.qrDataUrl} alt={t('phonePair.qrAlt')} />
              ) : (
                <div className={styles.phonePairLoading}>{t('phonePair.loadingQr')}</div>
              )}
            </div>
            <div className={styles.phonePairMeta}>
              <span>{remoteEnabled ? qrStatus : t('phonePair.killswitch.qrPaused')}</span>
            </div>
            <p className={styles.phonePairSecurityNote}>
              {t('phonePair.securityNote')}
            </p>
          </section>

          <section className={styles.phonePairSessionsPanel} aria-label={t('phonePair.ariaSessions')} data-disabled={remoteEnabled ? 'false' : 'true'}>
            <div className={styles.phonePairSessionsHeader}>
              <div>
                <h3>{t('phonePair.authorizedDevices')}</h3>
                <span>{sessionCountLabel}</span>
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
                              [styles.phonePairSessionBadgeActive]: remoteEnabled && session.recentlyActive,
                              [styles.phonePairSessionBadgeDisabled]: !remoteEnabled,
                            })}
                          >
                            {!remoteEnabled
                              ? t('phonePair.killswitch.statusDisabled')
                              : session.recentlyActive
                                ? t('phonePair.statusRecentlyActive')
                                : t('phonePair.statusPaired')}
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
      </DeviceModal>
      <ConfirmModal
        open={confirmRemoveAllOpen}
        title={t('phonePair.confirmRemoveAllTitle')}
        message={t('phonePair.confirmRemoveAllMessage')}
        note={t('phonePair.confirmRemoveAllNote')}
        confirmLabel={t('phonePair.removeAll')}
        onConfirm={revokeAllSessions}
        onCancel={() => setConfirmRemoveAllOpen(false)}
      />
      <ConfirmModal
        open={confirmDisableOpen}
        title={t('phonePair.killswitch.confirmTitle')}
        message={t('phonePair.killswitch.confirmMessage')}
        note={t('phonePair.killswitch.confirmNote')}
        confirmLabel={t('phonePair.killswitch.confirmAction')}
        onConfirm={confirmDisableRemote}
        onCancel={() => setConfirmDisableOpen(false)}
      />
    </>
  );
}

// ── Dashboard ───────────────────────────────────────────────────────────────

function Dashboard() {
  const { section, view, subtab, componentId, fromCategory, navigate, setView, setSubtab, navigateToComponent } = useRoute();
  const [pendingDeviceKey, setPendingDeviceKey] = useState<string | null>(null);
  const status = useServiceStatus();
  const online = status.state === 'online';
  const multiplex = useMultiplexConnection(online);
  const serviceState = useServiceState(online);
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

  const handlePreferencesChanged = useCallback((prefs: Preferences) => {
    applyThemeMode(prefs.theme.themeMode as ThemeMode);
    applyAccentColor(prefs.theme.accentColor);
    if (prefs.theme.language) setLanguage(prefs.theme.language as Language);
    cachePreferencesLocally({
      language: prefs.theme.language,
      themeMode: prefs.theme.themeMode,
      accentColor: prefs.theme.accentColor,
      disableConflictAlerts: prefs.ui?.disableConflictAlerts,
      monitoringShowAverage: prefs.monitoring?.showAverage,
      monitoringDetailedCollapsed: prefs.monitoring?.detailedCollapsed,
      showMacStatusBarIcon: prefs.monitoring?.showMacStatusBarIcon,
      showWindowsTrayIcon: prefs.monitoring?.showWindowsTrayIcon,
    });
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
  // Pair Remote killswitch state. Optimistic default of true matches the
  // service default so the dot color does not flicker before the first fetch.
  const [remoteControlEnabled, setRemoteControlEnabled] = useState(true);
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    const load = () => {
      void fetchPanelRemoteControlState().then(result => {
        if (cancelled || !result) return;
        setRemoteControlEnabled(result.enabled);
      });
    };
    load();
    // Keep the indicator honest even when another desktop window flips the
    // killswitch. 10 s is gentle - the modal itself is the high-frequency
    // surface, this only powers the sidebar dot color.
    const timer = window.setInterval(load, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [online]);
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

  // Bump on every offline -> online transition so the profile dropdown
  // remounts and replays its fade-in once.
  const wasOnlineRef = useRef(online);
  const [connectEpoch, setConnectEpoch] = useState(0);
  useEffect(() => {
    if (online && !wasOnlineRef.current) {
      setConnectEpoch(n => n + 1);
    }
    wasOnlineRef.current = online;
  }, [online]);

  // Prime the marketplace widget cache once the service is reachable so
  // the panel registry can resolve `marketplace:<id>` widgets the first
  // time a layout is reconciled. Refreshes are cheap (one /widgets-api
  // listing call) and idempotent.
  useEffect(() => {
    if (!online) return;
    void loadMarketplaceWidgets();
  }, [online]);

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
      case 'dashboard':  return (
        <DashboardView
          serviceOnline={online}
          connectionState={status.state}
          onSectionNavigate={(target, payload) => {
            if (target === 'devices' && payload?.deviceKey) setPendingDeviceKey(payload.deviceKey);
            setView(target);
          }}
        />
      );
      case 'monitoring': return <MonitoringView serviceOnline={online} connectionState={status.state} tab={subtab} onTabChange={setSubtab} />;
      case 'lighting':   return <LightingView serviceOnline={online} connectionState={status.state} activeProfileId={profilesHook.activeId} />;
      case 'cooling':    return <CoolingView serviceOnline={online} serviceState={serviceState} connectionState={status.state} activeProfileId={profilesHook.activeId} />;
      case 'devices':    return (
        <DevicesView
          serviceOnline={online}
          connectionState={status.state}
          initialOpenKey={pendingDeviceKey}
          onInitialOpenConsumed={() => setPendingDeviceKey(null)}
        />
      );
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
        <OpenInAppBanner />
        {/* Body row: sidebar (my-computer only) + content */}
        <div className={styles.bodyRow}>
          {hasSidebar && (
            <div className={classNames(styles.sidebarColumn, { [styles.sidebarCompact]: compact })}>
              <SidebarBrand
                compact={compact}
                onToggleCompact={() => setManualOverride(!sidebarCompact)}
                expandLabel={t('sidebar.expand')}
                collapseLabel={t('sidebar.collapse')}
              />
              <Sidebar
                items={serviceNav}
                active={serviceNavActive}
                onChange={handleServiceNavChange}
                sectionLabel={t('nav.section.my_computer')}
                serviceState={serviceState}
                headerSlot={
                  online ? (
                    <ConnectedProfileSlot connectEpoch={connectEpoch}>
                      <ProfileDropdown
                        profiles={profilesHook}
                        onPreferencesChanged={handlePreferencesChanged}
                        onNavigateSettings={handleNavigateSettings}
                        compact={compact}
                      />
                    </ConnectedProfileSlot>
                  ) : (
                    <NotConnectedBadge state={status.state} t={t} compact={compact} />
                  )
                }
                compact={compact}
                extraItems={portalNav}
                extraSectionLabel={t('nav.group.portal')}
                extraActive={portalNavActive}
                extraOnChange={handlePortalNavChange}
              />
              <PairPhoneButton
                connectedCount={serviceState.panel?.phoneSubscribers ?? 0}
                remoteEnabled={remoteControlEnabled}
                disabled={!online}
                compact={compact}
                onClick={() => setPairPhoneOpen(true)}
              />
              <SidebarConflictSlot serviceOnline={online} compact={compact} />
              <SidebarFooter
                active={activeView === 'tools'}
                onDebug={() => navigate('my-computer', 'tools')}
                debugIcon={NAV_ICONS['tools']}
                compact={compact}
              />
              <PairPhoneModal
                open={pairPhoneOpen}
                connectedCount={serviceState.panel?.phoneSubscribers ?? 0}
                remoteEnabled={remoteControlEnabled}
                onRemoteEnabledChange={setRemoteControlEnabled}
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
