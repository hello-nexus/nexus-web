import { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import classNames from 'classnames';
import { Placeholder } from '../components/views/Placeholder';
import { ErrorBoundary } from '../components/common/ErrorBoundary/ErrorBoundary';
import { ComponentDetailView } from '../components/views/ComponentDetailView';
import { BenchmarkView } from '../components/views/BenchmarkView/BenchmarkView';
import { AppsView } from '../components/views/AppsView/AppsView';
import { OpenInAppBanner } from '../components/common/OpenInAppBanner/OpenInAppBanner';
import { SettingsView } from '../components/views/SettingsView/SettingsView';
import { ProfilesView } from '../components/views/SettingsView/ProfilesView';
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
const ClockPage = lazy(() => import('../panel/widgets/clock/ClockPage').then(m => ({ default: m.ClockPage })));
const SteamPage = lazy(() => import('../panel/widgets/steam/SteamPage').then(m => ({ default: m.SteamPage })));
const GalleryPage = lazy(() => import('../panel/widgets/gallery/page/GalleryPage').then(m => ({ default: m.GalleryPage })));
const ScreentimePage = lazy(() => import('../panel/widgets/screentime/ScreentimePage').then(m => ({ default: m.ScreentimePage })));
import { getMarketplaceListing, isMarketplaceType, loadMarketplaceApps, marketplaceIdFromType } from '../widgets/marketplaceRegistry';
import { lookupApp } from '../panel/widgets/registry';
import { useServiceStatus } from '../hooks/useServiceStatus';
import { useServiceState } from '../hooks/useServiceState';
import { useProfiles } from '../hooks/useProfiles';
import { useRoute } from '../hooks/useRoute';
import { useBuilder } from '../hooks/useBuilder';
import { useUnifiedDevices } from '../hooks/useUnifiedDevices';
import { fetchPanelRemoteControlState } from '../api/panel';
import { isRemoteOrigin } from '../api/service';
import { MultiplexContext, useMultiplexConnection } from '../hooks/useMultiplexSocket';
import { UiSettingsProvider } from '../hooks/useUiSettings';
import { useTranslation } from '../lib/i18n';
import { applyThemeMode, applyAccentColor, cachePreferencesLocally } from '../lib/settings';
import type { Preferences } from '../api/profiles';
import type { Language, ThemeMode } from '../lib/settings';
import type { ComponentCategory, ComponentOption } from '../types/builder';
import { NAV_ICONS, PORTAL_NAV_KEYS } from './sidebarNav';
import { PageVersionLabel } from './sidebar';
import { TopBar } from './TopBar';
import { PageChromeProvider } from './PageChrome';
import { AppBackdrop } from './AppBackdrop';
import { BackgroundEffects } from './BackgroundEffects';
import { SystemAccentSync } from './SystemAccentSync';
import { ResolvedThemeSync } from './ResolvedThemeSync';
import { SplashPage } from './SplashPage';
import { getSidebarAppMeta } from './sidebarApps';
import { SidebarColumn } from './SidebarColumn';
import { CrossZoneDragProvider } from './CrossZoneDrag';
import { CommandPaletteProvider } from '../search/CommandPaletteProvider';
import { PairPhoneModal } from './PairPhoneModal';
import { IncomingPairModal } from './IncomingPairModal';
import { ToastProvider } from '../components/common/Toast/Toast';
import { TransferToasts } from './TransferToasts';
import { MappingAppliedToasts } from './MappingAppliedToasts';
import { useMonitoringStoreBridge } from './monitoringBridge';
import { isWindowsAppShell, isMacAppShell, postResizeStart, NEXUS_RESIZE_EDGES, type NexusResizeEdge } from './windowActions';
import styles from '../App.module.scss';

const PORTAL_URL = 'https://hellonexus.com';

const BuilderView = lazy(() => import('../components/views/BuilderView'));

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
    section, view, subtab, componentId, fromCategory,
    navigate, setView, setSubtab, navigateToComponent,
    canGoBack, canGoForward, goBack, goForward,
  } = useRoute();
  const status = useServiceStatus();
  const online = status.state === 'online';
  const multiplex = useMultiplexConnection(online);
  const serviceState = useServiceState(online, multiplex);
  const profilesHook = useProfiles(online);
  // Used only to resolve the active device's display name for the top-bar
  // title on /system/device/<key>.
  const unifiedDevices = useUnifiedDevices(online);
  const { t, setLanguage } = useTranslation();

  // Builder state (needed for sidebar in builder mode)
  const { build, dispatch, issues, wattage } = useBuilder();

  // Always-on monitoring: subscribe to composite frame + screentime at app
  // level so the store keeps accumulating (sparklines / history) across tab
  // switches. Backend drops cadence to 2 s by default.
  useMonitoringStoreBridge(multiplex);

  // The UiSettingsProvider below owns the server-preferences hydrate + cache +
  // theme/accent apply — the single source of truth for all three.

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
      pinnedSidebarApps: prefs.ui?.pinnedSidebarApps,
    });
  }, [setLanguage]);

  const handleNavigateSettings = useCallback(() => {
    navigate('system', 'settings');
  }, [navigate]);

  // The profile dropdown's "Manage profiles" lands on the standalone Profiles
  // page, not Settings.
  const handleManageProfiles = useCallback(() => {
    navigate('system', 'profiles');
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

  // Portal entries (System Builder / Benchmark / Community).
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
  // landing on /builder, /benchmark, or /community still have nav.
  const hasSidebar = !__SERVICE_BUILD__ || section === 'system';
  const serviceNavActive = section === 'system' ? activeView : '';
  const portalNavActive = section !== 'system' ? section : '';

  // Page name shown in the top-bar search pill. Portal sections use their
  // nav.section label; inside /system the active view resolves through the
  // sidebar app meta (Dashboard, Lighting, Cooling, ...), with the device and
  // settings views special-cased since they aren't pinnable apps.
  const pageTitle = (() => {
    if (section !== 'system') return t(`nav.section.${section}`);
    if (activeView === 'settings') return t('settings.title');
    if (activeView === 'profiles') return t('settings.tab.profiles');
    if (activeView === 'tools') return t('settings.tab.tools');
    // A specific device page shows the device's own name; the all-devices
    // landing keeps the generic "Devices" label.
    if (activeView === 'device') {
      const dev = unifiedDevices.unified.find(d => d.key === subtab);
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
    return meta ? t(meta.i18nKey) : t('nav.dashboard');
  })();
  // null = auto (follow viewport), true = user-collapsed, false = user-expanded
  const [manualOverride, setManualOverride] = useState<boolean | null>(null);
  const [pairPhoneOpen, setPairPhoneOpen] = useState(false);
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
  // panel registry can resolve `marketplace:<id>` widgets on first reconcile.
  useEffect(() => {
    if (!online) return;
    void loadMarketplaceApps();
  }, [online]);

  // ── Render main content based on section + view ────────────────────────
  const renderContent = () => {
    switch (section) {
      case 'system':
        return renderSystemView();
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
      case 'lighting':   return <LightingPage serviceOnline={online} serviceState={serviceState} connectionState={status.state} activeProfileId={profilesHook.activeId} platform={status.ping?.platform ?? ''} />;
      case 'smart-lights': return <SmartLightsPage onSectionNavigate={(target) => setView(target)} />;
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
        />
      );
      case 'clock':      return <ClockPage />;
      case 'steam':      return <SteamPage />;
      case 'gallery':    return <GalleryPage />;
      case 'settings':   return <SettingsView serviceOnline={online} connectionState={status.state} platform={status.ping?.platform ?? ''} />;
      case 'profiles':   return <ProfilesView serviceOnline={online} connectionState={status.state} profiles={profilesHook} />;
      case 'tools':      return <ToolsView serviceOnline={online} connectionState={status.state} />;
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

  // Public website (hellonexus.com) render gate. To avoid flashing the
  // dashboard's pre-connection chrome, never render the layout here until the
  // connection state is known:
  //   checking → blank themed frame (we don't yet know splash vs app)
  //   offline / offline-installed → coming-soon splash (no local Nexus reachable)
  //   online → fall through to the real dashboard below
  // On the bundled local app (localhost / --app shell, isServedFromService) this
  // whole block is skipped: it shows its normal connecting / "service required"
  // UI, NEVER the marketing splash.
  if (isRemoteOrigin && status.state !== 'online') {
    return status.state === 'checking'
      ? <div style={{ minHeight: '100dvh', background: 'var(--bg)' }} />
      : <SplashPage />;
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
          connectionState={status.state}
          connectEpoch={connectEpoch}
          profiles={profilesHook}
          onPreferencesChanged={handlePreferencesChanged}
          onNavigateSettings={handleNavigateSettings}
          onNavigateTools={handleNavigateTools}
          onManageProfiles={handleManageProfiles}
          isWindowsApp={isWindowsAppShell()}
          isMacApp={isMacAppShell()}
        />
        <PageVersionLabel />
        {/* Body row: sidebar (/system only) + content */}
        <div className={styles.bodyRow}>
          {hasSidebar && (
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
                navigations — a key change would hard-unmount the Suspense
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
        {/* Global incoming-pair prompt, at the layout root so it lands on top
            of any section. Pair Remote stays in its own modal below. */}
        <IncomingPairModal />
        {/* Incoming phone→PC transfer toasts, active regardless of view. */}
        <TransferToasts />
        {/* Community-layout auto-apply announcements with Undo, active regardless of view. */}
        <MappingAppliedToasts />
        <PairPhoneModal
          open={pairPhoneOpen}
          connectedCount={serviceState.panel?.phoneSubscribers ?? 0}
          remoteEnabled={remoteControlEnabled}
          onRemoteEnabledChange={setRemoteControlEnabled}
          onClose={() => setPairPhoneOpen(false)}
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
