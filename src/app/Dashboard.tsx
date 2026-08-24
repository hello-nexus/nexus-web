import { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import classNames from 'classnames';
import { Placeholder } from '../components/views/Placeholder';
import { ErrorBoundary } from '../components/common/ErrorBoundary/ErrorBoundary';
import { AppsView } from '../components/views/AppsView/AppsView';
import { OpenInAppBanner } from '../components/common/OpenInAppBanner/OpenInAppBanner';
import { SettingsView } from '../components/views/SettingsView/SettingsView';
import { ProfilesView } from '../components/views/SettingsView/ProfilesView';
import { AccountView } from '../components/views/SettingsView/Account/AccountView';
import { ToolsView } from '../components/views/ToolsView';
import { DevicePage } from '../components/views/DevicePage/DevicePage';
// Widget Pages are code-split: the dashboard only loads the immersive view
// when the user navigates into it. Cuts ~500KB off the main bundle so the
// iOS panel (which never renders any Page) doesn't ship them at all.
const CoolingPage = lazy(() => import('../panel/widgets/cooling/CoolingPage').then(m => ({ default: m.CoolingPage })));
const MonitoringPage = lazy(() => import('../panel/widgets/monitoring/MonitoringPage').then(m => ({ default: m.MonitoringPage })));
const DevicesPage = lazy(() => import('../panel/widgets/devices/DevicesPage').then(m => ({ default: m.DevicesPage })));
const LightingPage = lazy(() => import('../panel/widgets/lighting/LightingPage').then(m => ({ default: m.LightingPage })));
const SmartLightsPage = lazy(() => import('../panel/widgets/smart-lights/SmartLightsPage').then(m => ({ default: m.SmartLightsPage })));
const HomeAssistantPage = lazy(() => import('../panel/widgets/home-assistant/HomeAssistantPage').then(m => ({ default: m.HomeAssistantPage })));
const ClockPage = lazy(() => import('../panel/widgets/clock/ClockPage').then(m => ({ default: m.ClockPage })));
const SteamPage = lazy(() => import('../panel/widgets/steam/SteamPage').then(m => ({ default: m.SteamPage })));
const GalleryPage = lazy(() => import('../panel/widgets/gallery/page/GalleryPage').then(m => ({ default: m.GalleryPage })));
const ScreentimePage = lazy(() => import('../panel/widgets/screentime/ScreentimePage').then(m => ({ default: m.ScreentimePage })));
const BenchmarkPage = lazy(() => import('../panel/widgets/benchmark/BenchmarkPage').then(m => ({ default: m.BenchmarkPage })));
const DiagnosticsPage = lazy(() => import('../panel/widgets/diagnostics/DiagnosticsPage').then(m => ({ default: m.DiagnosticsPage })));
import { getMarketplaceListing, isMarketplaceType, loadMarketplaceApps, marketplaceIdFromType } from '../widgets/marketplaceRegistry';
import { lookupApp } from '../panel/widgets/registry';
import { useServiceStatus, DESKTOP_OFFLINE_GRACE_MS } from '../hooks/useServiceStatus';
import { useServiceState } from '../hooks/useServiceState';
import { useOnboardingStatus } from '../hooks/useOnboardingStatus';
import { useFanControlStatus } from '../hooks/useFanControlStatus';
import { useNexus2WelcomeStatus } from '../hooks/useNexus2WelcomeStatus';
import { useProfiles } from '../hooks/useProfiles';
import { useCloudAccounts } from '../hooks/useCloudAccounts';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { useRoute, type Section } from '../hooks/useRoute';
import { onDeckOpenMonitoring } from '../panel/widgets/deck/deckMonitoringNav';
import { requestOpenDeckEditor } from '../panel/widgets/deck/deckOpenEditorNav';
import { getPendingDeckEdit, type PendingDeckEdit } from '../api/streamdeck';
import { useUnifiedDevices } from '../hooks/useUnifiedDevices';
import { fetchPanelRemoteControlState } from '../api/panel';
import { isRemoteOrigin } from '../api/service';
import { MultiplexContext, useMultiplexConnection, useTopicCallback } from '../hooks/useMultiplexSocket';
import { UiSettingsProvider } from '../hooks/useUiSettings';
import { useTranslation } from '../lib/i18n';
import { applyThemeMode, applyAccentColor, cachePreferencesLocally } from '../lib/settings';
import type { Preferences } from '../api/profiles';
import type { Language, ThemeMode } from '../lib/settings';
import { FOCUS_CAPABLE_VIEWS, NAV_ICONS, PORTAL_NAV_KEYS } from './sidebarNav';
import { PageVersionLabel } from './sidebar';
import { TopBar } from './TopBar';
import { PageChromeProvider } from './PageChrome';
import { AppBackdrop } from './AppBackdrop';
import { BackgroundEffects } from './BackgroundEffects';
import { SystemAccentSync } from './SystemAccentSync';
import { ResolvedThemeSync } from './ResolvedThemeSync';
import { ServiceGatePage } from './ServiceGatePage';
import { getSidebarAppMeta } from './sidebarApps';
import { SidebarColumn } from './SidebarColumn';
import { CrossZoneDragProvider } from './CrossZoneDrag';
import { CommandPaletteProvider } from '../search/CommandPaletteProvider';
import { useSearchSignal } from '../search/signals';
import { checkHelloGreetingOnce } from '../search/helloGreetingStore';
import { PairPhoneModal } from './PairPhoneModal';
import { WelcomeScreen } from '../components/common/WelcomeScreen/WelcomeScreen';
import { Nexus2WelcomeScreen } from '../components/common/Nexus2WelcomeScreen/Nexus2WelcomeScreen';
import { LightingOnboardingScreen } from '../components/common/LightingOnboardingScreen/LightingOnboardingScreen';
import { FanControlImportScreen } from '../components/common/FanControlImport/FanControlImportScreen';
import { UpdateModal } from '../components/common/UpdateModal/UpdateModal';
import { getUpdateStatus, startUpdate, type UpdateStatus } from '../api/update';
import { IncomingPairModal } from './IncomingPairModal';
import { ToastProvider } from '../components/common/Toast/Toast';
import { TransferToasts } from './TransferToasts';
import { MappingAppliedToasts } from './MappingAppliedToasts';
import { SyncConflictGate } from './SyncConflictGate';
import { useMonitoringStoreBridge } from './monitoringBridge';
import { isWindowsAppShell, isMacAppShell, postResizeStart, NEXUS_RESIZE_EDGES, type NexusResizeEdge } from './windowActions';
import { DEV_TOOLS } from '../lib/devTools';
import styles from '../App.module.scss';

const PORTAL_URL = 'https://hellonexus.com';

const WHATS_NEW_SHOWN_KEY = 'nexus.whatsNewShownFor';

// True only the first time it sees a given version. The service holds
// justUpdatedTo for a fixed window after an update, so a window close+reopen
// inside that window would re-auto-open; persisting the shown version pins the
// auto-open to once per update.
function markWhatsNewShown(version: string): boolean {
  try {
    if (localStorage.getItem(WHATS_NEW_SHOWN_KEY) === version) return false;
    localStorage.setItem(WHATS_NEW_SHOWN_KEY, version);
  } catch { /* localStorage unavailable; fall through and show */ }
  return true;
}

// Auto-opens the modal when justUpdatedTo is set (post-install what's-new view).
function UpdateAutoOpener({ online, onOpen }: {
  online: boolean;
  onOpen: (status: UpdateStatus) => void;
}) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (!online || firedRef.current) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;
    // justUpdatedTo appears once the post-install service finishes starting. A
    // fetch that lands on the pre-swap service returns empty; the service holds
    // the value for 60s, so re-check briefly until it shows rather than latching
    // empty and missing the what's-new view.
    const check = () => {
      if (cancelled || firedRef.current) return;
      getUpdateStatus().then(s => {
        if (cancelled || firedRef.current || !s) return;
        if (s.justUpdatedTo) {
          firedRef.current = true;
          // Auto-open once per update; a reopen within the service's
          // justUpdatedTo hold window must not re-trigger. Manual opens (update
          // icon / "check updates") go through onOpen directly and bypass this.
          if (markWhatsNewShown(s.justUpdatedTo)) onOpen(s);
          return;
        }
        if (++tries < 8) timer = setTimeout(check, 2000);
      });
    };
    check();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [online, onOpen]);

  return null;
}

const DECK_EDIT_SHOWN_KEY = 'nexus.deckEditShownFor';

// True only the first time it sees a given hold token, so a reload within the
// service's pending-edit hold window doesn't re-hijack navigation, and a live
// frame plus the boot-time GET of the same hold open the editor exactly once.
function markDeckEditShown(token: number): boolean {
  try {
    const key = String(token);
    if (localStorage.getItem(DECK_EDIT_SHOWN_KEY) === key) return false;
    localStorage.setItem(DECK_EDIT_SHOWN_KEY, key);
  } catch { /* localStorage unavailable; fall through and open */ }
  return true;
}

// Bridges a blank-key hold-to-edit (StreamDeckConnectionWorker) to this
// surface: the live 'editRequest' frame when the dashboard is already open, and
// a boot-time GET for a hold that fired while it was closed (the same hold's
// OpenApp launched this window). Both dedupe on the hold token.
function DeckEditAutoOpener({ online, onOpen }: {
  online: boolean;
  onOpen: (edit: PendingDeckEdit) => void;
}) {
  const fire = useCallback((edit: PendingDeckEdit) => {
    if (markDeckEditShown(edit.token)) onOpen(edit);
  }, [onOpen]);

  useTopicCallback('streamdeck', online && !isRemoteOrigin, useCallback((data: unknown) => {
    const f = data as { kind?: string; serial?: string; page?: number; folderPath?: number[]; keyIndex?: number; token?: number };
    if (f.kind !== 'editRequest' || !f.serial || typeof f.token !== 'number') return;
    fire({
      serial: f.serial,
      page: typeof f.page === 'number' ? f.page : 0,
      folderPath: Array.isArray(f.folderPath) ? f.folderPath : [],
      keyIndex: typeof f.keyIndex === 'number' ? f.keyIndex : 0,
      token: f.token,
    });
  }, [fire]));

  // The service holds the intent until it ages out, and set it before the
  // OpenApp that launched us, so a fetch on connect catches a hold that fired
  // while the app was closed. firedRef latches only after an edit is found, so
  // an online-flip mid-fetch (reconnect while the fresh service is spinning up)
  // re-fetches instead of dropping the cold-start edit.
  const firedRef = useRef(false);
  useEffect(() => {
    if (!online || isRemoteOrigin || firedRef.current) return;
    let cancelled = false;
    getPendingDeckEdit().then(edit => {
      if (cancelled || firedRef.current || !edit) return;
      firedRef.current = true;
      fire(edit);
    });
    return () => { cancelled = true; };
  }, [online, fire]);

  return null;
}

function UpdateModalWithDismiss(props: {
  open: boolean;
  onClose: () => void;
  status: UpdateStatus | null;
  onStatusRefreshed: (s: UpdateStatus) => void;
  startedInstall?: boolean;
}) {
  const { open, onClose, status, onStatusRefreshed, startedInstall } = props;

  return (
    <UpdateModal
      open={open}
      onClose={onClose}
      status={status}
      onStatusRefreshed={onStatusRefreshed}
      startedInstall={startedInstall}
    />
  );
}

// Catches mousedown on a window-edge strip and IPCs the shell, which
// then posts WM_NCLBUTTONDOWN(hitCode) to its own HWND so the OS
// resize-drag loop takes over. Preventing default + stopping prop is
// what keeps the mousedown from racing the page's click handlers.
function ResizeStrip({ className, edge }: { className: string; edge: NexusResizeEdge }) {
  return (
    <div
      className={className}
      aria-hidden
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        postResizeStart(edge);
      }}
    />
  );
}

export function Dashboard() {
  const {
    section, view, subtab,
    navigate, setView, setSubtab,
    canGoBack, canGoForward, goBack, goForward,
  } = useRoute();
  const status = useServiceStatus(true, DESKTOP_OFFLINE_GRACE_MS);
  const online = status.state === 'online';
  const { status: onboardingStatus, lightingStatus } = useOnboardingStatus();
  // Flips true once WelcomeScreen posts /onboarding/complete, so a later
  // reconnect (which re-derives onboardingStatus) can't reopen it mid-session.
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [lightingOnboardingDismissed, setLightingOnboardingDismissed] = useState(false);
  // Set by any later gate's Back path that targets the welcome screen.
  // Reopens it even when its server flag already completed (e.g. a reload
  // mid-sequence resolved onboardingStatus to 'completed').
  const [welcomeRevisit, setWelcomeRevisit] = useState(false);
  const welcomeOpen = (onboardingStatus === 'pending' || welcomeRevisit) && !onboardingDismissed;
  // Fetched on mount alongside onboarding (not deferred) so the handoff from
  // WelcomeScreen to this screen can land in the same render pass.
  const nexus2 = useNexus2WelcomeStatus();
  const [nexus2Dismissed, setNexus2Dismissed] = useState(false);
  const fanControl = useFanControlStatus();
  const [fanControlDismissed, setFanControlDismissed] = useState(false);
  // Second gate: a returning Nexus 2 user closes/imports from the old app
  // BEFORE device selection - Nexus 2 holds the very hardware the lighting
  // gate enumerates, so it must be out of the way for that list to be
  // complete.
  const nexus2Open = (onboardingStatus === 'completed' || onboardingDismissed)
    && !welcomeOpen && nexus2.status === 'pending' && !nexus2Dismissed;
  // Third gate: device selection runs last, against the fullest device list.
  // Waits on nexus2.status resolving so it cannot flash open before the
  // heavier Nexus 2 detection read decides whether that gate comes first.
  const lightingOnboardingOpen = onboardingStatus !== 'unknown' && nexus2.status !== 'unknown'
    && !welcomeOpen && !nexus2Open
    && lightingStatus === 'pending' && !lightingOnboardingDismissed;
  // Fourth gate: FanControl users. Runs after device selection because it is
  // about cooling configuration, not about which hardware Nexus drives, and
  // its import binds curves to the fan channels that selection settles.
  const fanControlOpen = onboardingStatus !== 'unknown' && nexus2.status !== 'unknown'
    && fanControl.status !== 'unknown'
    && !welcomeOpen && !nexus2Open && !lightingOnboardingOpen
    && fanControl.status === 'pending' && !fanControlDismissed;
  // 'unknown' renders neither the dashboard nor any onboarding gate (only
  // the app background) so a fresh install never flashes the dashboard
  // chrome while the fast local /onboarding fetch is still in flight. All
  // gates hide the chrome entirely, not just cover it: their surfaces go
  // transparent in the native-glass shell, so covered-but-mounted chrome
  // would show through. Gating on nexus2.status too (not just
  // onboardingStatus) matters for a returning user whose onboarding already
  // completed in a prior session: onboardingStatus resolves near-instantly
  // from a local flag, but the service's Nexus 2 detection ladder is a
  // heavier read - without this the dashboard would flash before
  // Nexus2WelcomeScreen pops in on top of it.
  const showDashboard = onboardingStatus !== 'unknown' && nexus2.status !== 'unknown'
    && fanControl.status !== 'unknown'
    && !welcomeOpen && !lightingOnboardingOpen && !nexus2Open && !fanControlOpen;
  const multiplex = useMultiplexConnection(online);
  const serviceState = useServiceState(online, multiplex);
  const profilesHook = useProfiles(online);
  const cloudAccounts = useCloudAccounts(online);
  // Sync conflicts only exist while a cloud account is signed in; without this
  // gate the 25s poll in useSyncStatus would run forever on every install,
  // signed in or not. useCloudAccounts itself only fetches once per online
  // flip (no poll), so activeAccountId is a safe, non-polling presence signal.
  const syncStatus = useSyncStatus(online && cloudAccounts.activeAccountId != null);
  // Used only to resolve the active device's display name for the top-bar
  // title on /system/device/<key>.
  const unifiedDevices = useUnifiedDevices(online);
  const { t, setLanguage } = useTranslation();

  // Always-on monitoring: subscribe to composite frame + screentime at app
  // level so the store keeps accumulating (sparklines / history) across tab
  // switches. Backend drops cadence to 2 s by default.
  useMonitoringStoreBridge(multiplex);

  // The UiSettingsProvider below owns the server-preferences hydrate + cache +
  // theme/accent apply - the single source of truth for all three.

  const handlePreferencesChanged = useCallback((prefs: Preferences) => {
    applyThemeMode(prefs.theme.themeMode as ThemeMode);
    applyAccentColor(prefs.theme.accentColor);
    if (prefs.theme.language) setLanguage(prefs.theme.language as Language);
    cachePreferencesLocally({
      language: prefs.theme.language,
      themeMode: prefs.theme.themeMode,
      accentColor: prefs.theme.accentColor,
      showConflictAlerts: prefs.ui?.showConflictAlerts,
      monitoringDetailedCollapsed: prefs.monitoring?.detailedCollapsed,
      showMacStatusBarIcon: prefs.monitoring?.showMacStatusBarIcon,
      showWindowsTrayIcon: prefs.monitoring?.showWindowsTrayIcon,
      pinnedSidebarApps: prefs.ui?.pinnedSidebarApps,
      recentSidebarApps: prefs.ui?.recentSidebarApps,
    });
  }, [setLanguage]);

  const handleNavigateSettings = useCallback(() => {
    navigate('system', 'settings');
  }, [navigate]);

  // Bridges a monitoring deck tile's `press: 'monitoringPage'` (deckExecutor
  // has no router access) to this surface's in-app Monitoring page.
  useEffect(() => onDeckOpenMonitoring(() => navigate('system', 'monitoring')), [navigate]);

  // Navigate to the held deck's editor and hand the target to the (possibly
  // about-to-mount) device page, which selects the held key.
  const handleOpenDeckEditor = useCallback((edit: PendingDeckEdit) => {
    navigate('system', 'device', `streamdeck:${edit.serial}`);
    requestOpenDeckEditor({ serial: edit.serial, page: edit.page, folderPath: edit.folderPath, keyIndex: edit.keyIndex });
  }, [navigate]);

  // The profile dropdown's "Manage profiles" lands on the standalone Profiles
  // page, not Settings.
  const handleManageProfiles = useCallback(() => {
    navigate('system', 'profiles');
  }, [navigate]);

  // The profile dropdown's "Manage account" lands on the standalone Account
  // page, not Settings.
  const handleNavigateAccount = useCallback(() => {
    navigate('system', 'account');
  }, [navigate]);

  // The "..." overflow menu's "Dev tools" entry opens the standalone developer
  // diagnostics page.
  const handleNavigateTools = useCallback(() => {
    navigate('system', 'tools');
  }, [navigate]);

  const handleServiceNavChange = useCallback((key: string) => {
    if (section === 'system') {
      setView(key);
    } else {
      navigate('system', key);
    }
  }, [section, setView, navigate]);

  const handlePortalNavChange = useCallback((key: string) => {
    navigate(key as Section);
  }, [navigate]);

  // Portal entries (Benchmark).
  // Service build: external <a> to hellonexus.com (new tab).
  // Full build: in-app navigate (entries are real SPA routes on hellonexus.com).
  const portalNav = PORTAL_NAV_KEYS.map(key => ({
    key,
    label: t(`nav.section.${key}`),
    icon: NAV_ICONS[key],
    ...(__SERVICE_BUILD__ ? { href: `${PORTAL_URL}/${key}` } : {}),
  }));

  // Active view within the system section
  const activeView = view || 'dashboard';

  // In service build the sidebar is only meaningful on /system (the
  // PORTAL entries open hellonexus.com in a new tab and never change `section`
  // locally). In the full build sidebar must render on every section so users
  // landing on a portal entry still have nav.
  const hasSidebar = !__SERVICE_BUILD__ || section === 'system';
  const serviceNavActive = section === 'system' ? activeView : '';
  const portalNavActive = section !== 'system' ? section : '';

  // Focus mode: full-width, chrome-stripped view of a single focus-capable
  // page (see FOCUS_CAPABLE_VIEWS). focusCapable re-derives every render from
  // the active route; focusActive (not the raw focusMode state) is what every
  // layout consumer below reads, so a route change that leaves a capable page
  // drops the full-width layout in the SAME commit instead of one render
  // later - a navigate() that bypasses the (now-hidden) TopBar entirely, e.g.
  // the command palette shortcut, would otherwise paint one frame of the new
  // page under the old page's full-width chrome. The effect then clears the
  // underlying focusMode state so Focus doesn't silently resume if the user
  // later returns to a capable page.
  const focusCapable = section === 'system' && FOCUS_CAPABLE_VIEWS.has(activeView);
  const [focusMode, setFocusMode] = useState(false);
  const focusActive = focusMode && focusCapable;
  useEffect(() => {
    if (!focusCapable && focusMode) setFocusMode(false);
  }, [focusCapable, focusMode]);
  const toggleFocusMode = useCallback(() => setFocusMode(f => !f), []);

  // Page name shown in the top-bar search pill. Portal sections use their
  // nav.section label; inside /system the active view resolves through the
  // sidebar app meta (Dashboard, Lighting, Cooling, ...), with the device and
  // settings views special-cased since they aren't pinnable apps.
  const pageTitle = (() => {
    if (section !== 'system') return t(`nav.section.${section}`);
    if (activeView === 'settings') return t('settings.title');
    if (activeView === 'profiles') return t('settings.tab.profiles');
    if (activeView === 'account') return t('account.title');
    if (activeView === 'tools') return t('settings.tab.tools');
    // A specific device page shows the device's own name; the all-devices
    // landing keeps the generic "Devices" label.
    if (activeView === 'device') {
      const dev = unifiedDevices.unified.find(d => d.key === subtab);
      // Stream Deck's top-bar title mirrors the sidebar's model label
      // ("Stream Deck Mini") instead of the per-deck custom name.
      if (dev?.curatedId === 'streamdeck') return dev.shortName;
      return dev?.name ?? t('sidebar.section.devices');
    }
    if (activeView === 'devices') return t('sidebar.section.devices');
    // A marketplace (SDK) widget's page: the top bar shows the widget's name.
    if (activeView && isMarketplaceType(activeView)) {
      const id = marketplaceIdFromType(activeView);
      const name = id ? getMarketplaceListing(id)?.name : undefined;
      if (name) return name;
    }
    const meta = getSidebarAppMeta(activeView);
    return meta ? t(meta.i18nKey) : t('sidebar.section.apps');
  })();
  // null = auto (follow viewport), true = user-collapsed, false = user-expanded
  const [manualOverride, setManualOverride] = useState<boolean | null>(null);
  const [pairPhoneOpen, setPairPhoneOpen] = useState(false);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [startedInstall, setStartedInstall] = useState(false);
  // Pair Remote killswitch state. Optimistic default of true matches the
  // service default so the dot color does not flicker before the first fetch.
  const [remoteControlEnabled, setRemoteControlEnabled] = useState(true);

  // Mark <body> when running inside the Windows-app shell so portaled
  // chrome (modals, popovers) can reserve the top-right 138px caption-
  // button gutter without each consumer re-detecting the shell.
  useEffect(() => {
    document.body.classList.toggle('nexus-shell-windows-app', isWindowsAppShell());
    // Mark <html> for the macOS shell so its top chrome can inset below the
    // native traffic lights.
    document.documentElement.classList.toggle('nexus-shell-mac-app', isMacAppShell());
    // Mark <html> for any shell with a native behind-window frosted material
    // (macOS + Windows) so glass mode drops the opaque backdrop and lets it
    // show through.
    document.documentElement.classList.toggle('nexus-shell-native-glass', isMacAppShell() || isWindowsAppShell());
  }, []);
  // Idle-time prefetch of the four most-used Page chunks (cooling, lighting,
  // monitoring, devices) plus the shared registry chunk they pull in. Fires
  // once after first render so navigation finds them warmed. Lives here, not
  // PanelEntrypoint.tsx, so the panel/iPhone (where Pages aren't reachable)
  // never downloads them.
  useEffect(() => {
    const preload = () => {
      void import('../panel/widgets/cooling/CoolingPage');
      void import('../panel/widgets/lighting/LightingPage');
      void import('../panel/widgets/monitoring/MonitoringPage');
      void import('../panel/widgets/devices/DevicesPage');
    };
    if (typeof window.requestIdleCallback === 'function') {
      // timeout: run within 2 s even if the main thread stays busy, since
      // idle-callback can otherwise be deferred indefinitely on a slow box.
      const id = window.requestIdleCallback(preload, { timeout: 2000 });
      return () => window.cancelIdleCallback?.(id);
    }
    // Safari + older WebView2 lack requestIdleCallback; fall back to a
    // post-interactive timeout that's still well past first paint.
    const t = window.setTimeout(preload, 1500);
    return () => window.clearTimeout(t);
  }, []);
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
    // Re-poll so the sidebar dot tracks the killswitch when another desktop
    // window flips it. 10 s; the modal is the high-frequency surface.
    const timer = window.setInterval(load, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [online]);
  // One-time boot greeting for the top search bar: fetches the service's
  // boot id once online and queues a greeting if this OS boot hasn't been
  // greeted yet (checkHelloGreetingOnce no-ops after its first call).
  useEffect(() => {
    if (online) void checkHelloGreetingOnce();
  }, [online]);
  // Auto-collapse threshold. Stays above the OS-enforced min window
  // width (1000px - see MinClientWidth in nexus-overlay's DashboardWindow.cs)
  // so the sidebar still collapses before the user hits the hard floor;
  // otherwise the user would never see auto-collapse fire on the
  // Windows --app shell. Keep the matchMedia query and the useState
  // seed value in lockstep.
  const [viewportNarrow, setViewportNarrow] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 1199px)').matches,
  );
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 1199px)');
    const handler = (e: MediaQueryListEvent) => setViewportNarrow(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  // The "expanded while narrow" override (false) is transient: clear it when
  // the viewport widens so the next narrow trip re-applies auto-collapse.
  // Manual collapse (override === true) is the only preference that persists
  // across width changes.
  useEffect(() => {
    if (!viewportNarrow && manualOverride === false) {
      setManualOverride(null);
    }
  }, [viewportNarrow, manualOverride]);
  // Manual override (true=collapsed, false=expanded) always wins over the
  // viewport heuristic when set; null hands control back to auto-collapse.
  const sidebarCompact = manualOverride !== null ? manualOverride : viewportNarrow;
  const compact = hasSidebar && sidebarCompact;

  const handleUpdateOpen = useCallback(async (preloaded?: UpdateStatus) => {
    setStartedInstall(false);
    if (preloaded) {
      setUpdateStatus(preloaded);
      setUpdateModalOpen(true);
    } else {
      const s = await getUpdateStatus();
      if (s) setUpdateStatus(s);
      setUpdateModalOpen(true);
    }
  }, []);

  const handleInstall = useCallback(async () => {
    const s = await getUpdateStatus();
    if (s) setUpdateStatus(s);
    void startUpdate(s?.latestVersion, { reopenAfter: true });
    setStartedInstall(true);
    setUpdateModalOpen(true);
  }, []);

  // Search's "Check for updates" entry opens the modal this component owns
  // (the modal auto-checks on open).
  useSearchSignal('update-modal', useCallback(() => { void handleUpdateOpen(); }, [handleUpdateOpen]));

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

  // Prime the marketplace widget cache once the service is reachable so the
  // panel registry can resolve `app:<id>` widgets on first reconcile.
  useEffect(() => {
    if (!online) return;
    void loadMarketplaceApps();
  }, [online]);

  // ── Render main content based on section + view ────────────────────────
  const renderContent = () => {
    switch (section) {
      case 'system':
        return renderSystemView();
      default:
        return <Placeholder title={section} />;
    }
  };

  const renderSystemView = () => {
    switch (activeView) {
      case 'dashboard':  return (
        <AppsView
          serviceOnline={online}
          connectionState={status.state}
          onSectionNavigate={(target, payload) => {
            // The devices widget passes payload.deviceKey when a tile is tapped;
            // route directly into that device's page instead of the all-devices
            // landing.
            if (target === 'devices' && payload?.deviceKey) {
              navigate('system', 'device', payload.deviceKey);
              return;
            }
            setView(target);
          }}
        />
      );
      case 'monitoring': return <MonitoringPage serviceOnline={online} connectionState={status.state} tab={subtab} onTabChange={setSubtab} />;
      case 'screentime': return <ScreentimePage serviceOnline={online} connectionState={status.state} tab={subtab} onTabChange={setSubtab} />;
      case 'benchmark':  return <BenchmarkPage serviceOnline={online} connectionState={status.state} tab={subtab} onTabChange={setSubtab} />;
      case 'lighting':   return <LightingPage serviceOnline={online} serviceState={serviceState} connectionState={status.state} activeProfileId={profilesHook.activeId} platform={status.ping?.platform ?? ''} onSectionNavigate={(target, payload) => {
        // The LED-map hub composition panel deep-links to a device page.
        if (target === 'device' && payload?.deviceKey) { navigate('system', 'device', payload.deviceKey); return; }
        setView(target);
      }} />;
      case 'smart-lights': return <SmartLightsPage onSectionNavigate={(target) => setView(target)} />;
      case 'home-assistant': return <HomeAssistantPage />;
      case 'cooling':    return <CoolingPage serviceOnline={online} serviceState={serviceState} connectionState={status.state} activeProfileId={profilesHook.activeId} />;
      case 'devices':    return (
        <DevicesPage
          serviceOnline={online}
          connectionState={status.state}
          onDeviceSelect={k => navigate('system', 'device', k)}
          tab={subtab}
          onTabChange={setSubtab}
        />
      );
      case 'device':     return (
        <DevicePage
          deviceKey={subtab ?? ''}
          serviceOnline={online}
          connectionState={status.state}
          onOpenFirmware={() => navigate('system', 'devices', 'firmware')}
          onSectionNavigate={(target) => setView(target)}
        />
      );
      case 'diagnostics': return <DiagnosticsPage serviceOnline={online} connectionState={status.state} platform={status.ping?.platform ?? ''} tab={subtab} onTabChange={setSubtab} />;
      case 'clock':      return <ClockPage />;
      case 'steam':      return <SteamPage />;
      case 'gallery':    return <GalleryPage />;
      case 'settings':   return <SettingsView serviceOnline={online} connectionState={status.state} platform={status.ping?.platform ?? ''} tab={subtab} onTabChange={setSubtab} />;
      case 'profiles':   return <ProfilesView serviceOnline={online} connectionState={status.state} profiles={profilesHook} />;
      case 'account':    return DEV_TOOLS ? <AccountView serviceOnline={online} connectionState={status.state} accounts={cloudAccounts} sync={syncStatus} tab={subtab} onTabChange={setSubtab} /> : <Placeholder title={activeView} />;
      case 'tools':      return DEV_TOOLS ? <ToolsView serviceOnline={online} connectionState={status.state} /> : <Placeholder title={activeView} />;
      default: {
        // Page-capable marketplace (SDK) widget: render its bundle's page surface
        // as a section view (e.g. the clock's world map). The synthetic manifest
        // supplies SdkMarketplacePage as its Page.
        if (activeView && isMarketplaceType(activeView)) {
          const MarketplacePage = lookupApp(activeView)?.Page;
          if (MarketplacePage) return <MarketplacePage type={activeView} />;
        }
        return <Placeholder title={activeView} />;
      }
    }
  };

  // Public website (my.hellonexus.com) render gate. To avoid flashing the
  // dashboard's pre-connection chrome, never render the layout here until the
  // connection state is known:
  //   checking → blank themed frame (we don't yet know gate vs app)
  //   offline / offline-installed → launch / download gate (no local Nexus reachable)
  //   online → fall through to the real dashboard below
  // On the bundled local app (localhost / --app shell, isServedFromService) this
  // whole block is skipped: it shows its normal connecting / "service required"
  // UI.
  if (isRemoteOrigin && status.state !== 'online') {
    return status.state === 'checking'
      ? <div style={{ minHeight: '100dvh', background: 'var(--bg)' }} />
      : <ServiceGatePage state={status.state} />;
  }

  return (
    <MultiplexContext.Provider value={multiplex}>
      <UiSettingsProvider
        serviceOnline={online}
        activeProfileId={profilesHook.activeId}
      >
      <CrossZoneDragProvider>
      <CommandPaletteProvider navigate={navigate} onPairPhone={() => setPairPhoneOpen(true)}>
      <ToastProvider>
      <PageChromeProvider>
      <div className={classNames(styles.layout, {
        [styles.layoutCompact]: compact,
        [styles.layoutWindowsApp]: isWindowsAppShell(),
        [styles.layoutFocusMode]: focusActive,
      })}>
        <AppBackdrop />
        <BackgroundEffects />
        <SystemAccentSync />
        <ResolvedThemeSync />
        <OpenInAppBanner />
        {/* Nexus Windows shell only: window-resize grab strips along each
            edge. The drag region + caption buttons now live in the top bar
            below; these strips IPC nexus-overlay to start the native resize
            loop. Portaled to <body> (position: fixed, z-index above
            --z-modal) so they escape .layout's isolated stacking context
            and stay grabbable above modal backdrops - resizing the window
            must keep working while a dialog is open. */}
        {isWindowsAppShell() && createPortal(
          <>
            <ResizeStrip className={styles.windowResizeStripLeft} edge={NEXUS_RESIZE_EDGES.left} />
            <ResizeStrip className={styles.windowResizeStripRight} edge={NEXUS_RESIZE_EDGES.right} />
            <ResizeStrip className={styles.windowResizeStripTop} edge={NEXUS_RESIZE_EDGES.top} />
            <ResizeStrip className={styles.windowResizeStripBottom} edge={NEXUS_RESIZE_EDGES.bottom} />
            <ResizeStrip className={styles.windowResizeCornerTopLeft} edge={NEXUS_RESIZE_EDGES.topLeft} />
            {/* No top-right corner strip: it would overlap the close button.
                Resize via the top or right edge instead. */}
            <ResizeStrip className={styles.windowResizeCornerBottomLeft} edge={NEXUS_RESIZE_EDGES.bottomLeft} />
            <ResizeStrip className={styles.windowResizeCornerBottomRight} edge={NEXUS_RESIZE_EDGES.bottomRight} />
          </>,
          document.body,
        )}
        {/* Dashboard chrome renders only once onboarding status is resolved
            (never on 'unknown') and only when neither onboarding gate is open -
            hidden entirely, not just covered, so nothing behind the gates
            can ever show through their backgrounds in any theme/glass mode. */}
        {showDashboard && (
          <>
            <TopBar
              hasSidebar={hasSidebar}
              compact={compact}
              onToggleCompact={() => setManualOverride(!sidebarCompact)}
              pageTitle={pageTitle}
              canGoBack={canGoBack}
              canGoForward={canGoForward}
              goBack={goBack}
              goForward={goForward}
              online={online}
              platform={status.ping?.platform ?? ''}
              connectionState={status.state}
              connectEpoch={connectEpoch}
              profiles={profilesHook}
              cloudAccounts={cloudAccounts}
              onPreferencesChanged={handlePreferencesChanged}
              onNavigateSettings={handleNavigateSettings}
              onNavigateTools={handleNavigateTools}
              onOpenUpdate={() => handleUpdateOpen()}
              onInstall={handleInstall}
              onManageProfiles={handleManageProfiles}
              onNavigateAccount={handleNavigateAccount}
              isWindowsApp={isWindowsAppShell()}
              isMacApp={isMacAppShell()}
              focusCapable={focusCapable}
              focusMode={focusActive}
              onToggleFocusMode={toggleFocusMode}
            />
            <PageVersionLabel />
            {/* Body row: sidebar (/system only, and never in Focus mode) + content */}
            <div className={styles.bodyRow}>
              {hasSidebar && !focusActive && (
                <SidebarColumn
                  compact={compact}
                  online={online}
                  serviceState={serviceState}
                  serviceNavActive={serviceNavActive}
                  onServiceNavChange={handleServiceNavChange}
                  portalNav={portalNav}
                  portalNavActive={portalNavActive}
                  onPortalNavChange={handlePortalNavChange}
                  remoteControlEnabled={remoteControlEnabled}
                  phoneSubscribers={serviceState.panel?.phoneSubscribers ?? 0}
                  onPairPhoneOpen={() => setPairPhoneOpen(true)}
                  activeDeviceKey={section === 'system' && activeView === 'device' ? (subtab ?? '') : ''}
                  onDeviceSelect={k => navigate('system', 'device', k)}
                  onDevicesHeaderClick={() => navigate('system', 'devices')}
                  devicesHeaderActive={section === 'system' && activeView === 'devices'}
                />
              )}

              <div className={styles.mainColumn}>
                <div className={styles.content}>
                  {/*
                    resetKey (not key) so the boundary instance is stable across
                    navigations - a key change would hard-unmount the Suspense
                    below it and defeat startTransition's "keep prior UI visible
                    while the next chunk loads" behavior, producing a one-frame
                    blank flash on every nav. resetKey clears caught errors when
                    the route changes without remounting the tree.
                  */}
                  <ErrorBoundary resetKey={`${section}/${view}`}>
                    <Suspense fallback={null}>{renderContent()}</Suspense>
                  </ErrorBoundary>
                </div>
              </div>
            </div>
          </>
        )}
        {/* First-run gate: server-authoritative (GET /onboarding), so a
            factory reset correctly reopens it. Sits above everything else
            below, same root-modal tier. */}
        <WelcomeScreen
          open={welcomeOpen}
          platform={status.ping?.platform ?? ''}
          onComplete={() => setOnboardingDismissed(true)}
        />
        {/* Returning-HYTE-Nexus-2-user gate: shows once, right after the
            welcome screen, only when the service reports it pending (Nexus 2
            detected AND a Y70/Q-series device is known). Runs before device
            selection so the old app releases the hardware first. */}
        <Nexus2WelcomeScreen
          open={nexus2Open}
          payload={nexus2.payload}
          onComplete={() => setNexus2Dismissed(true)}
          onBack={() => { setWelcomeRevisit(true); setOnboardingDismissed(false); }}
        />
        {/* Lighting device-selection gate, last in the sequence, gated by its
            own server-side flag so a factory reset reopens everything. Back
            targets the Nexus 2 gate when this install has one, else the
            welcome screen. */}
        <LightingOnboardingScreen
          open={lightingOnboardingOpen}
          onComplete={() => setLightingOnboardingDismissed(true)}
          onBack={() => {
            if (nexus2.status === 'pending') setNexus2Dismissed(false);
            else { setWelcomeRevisit(true); setOnboardingDismissed(false); }
          }}
        />
        {/* FanControl gate, last in the sequence: offers to bring that app's
            curves, calibrations and fan settings over, then closes it and
            removes its autostart so the two do not drive the same fans. */}
        <FanControlImportScreen
          open={fanControlOpen}
          payload={fanControl.payload}
          onComplete={() => setFanControlDismissed(true)}
          onBack={() => {
            if (lightingStatus === 'pending') setLightingOnboardingDismissed(false);
            else if (nexus2.status === 'pending') setNexus2Dismissed(false);
            else { setWelcomeRevisit(true); setOnboardingDismissed(false); }
          }}
        />
        {/* Global incoming-pair prompt, at the layout root so it lands on top
            of any section. Pair Remote stays in its own modal below. */}
        <IncomingPairModal />
        {/* Incoming phone→PC transfer toasts, active regardless of view. */}
        <TransferToasts />
        {/* Community-layout auto-apply announcements with Undo, active regardless of view. */}
        <MappingAppliedToasts />
        {/* Steam-cloud-style profile sync conflict prompt, active regardless of view. */}
        <SyncConflictGate sync={syncStatus} />
        <PairPhoneModal
          open={pairPhoneOpen}
          connectedCount={serviceState.panel?.phoneSubscribers ?? 0}
          remoteEnabled={remoteControlEnabled}
          onRemoteEnabledChange={setRemoteControlEnabled}
          onClose={() => setPairPhoneOpen(false)}
        />
        <UpdateAutoOpener online={online} onOpen={handleUpdateOpen} />
        <DeckEditAutoOpener online={online} onOpen={handleOpenDeckEditor} />
        <UpdateModalWithDismiss
          open={updateModalOpen}
          onClose={() => { setUpdateModalOpen(false); setStartedInstall(false); }}
          status={updateStatus}
          onStatusRefreshed={setUpdateStatus}
          startedInstall={startedInstall}
        />
      </div>
      </PageChromeProvider>
      </ToastProvider>
      </CommandPaletteProvider>
      </CrossZoneDragProvider>
      </UiSettingsProvider>
    </MultiplexContext.Provider>
  );
}
