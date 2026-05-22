import { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react';
import classNames from 'classnames';
import { Placeholder } from '../components/views/Placeholder';
import { ErrorBoundary } from '../components/common/ErrorBoundary/ErrorBoundary';
import { ComponentDetailView } from '../components/views/ComponentDetailView';
import { BenchmarkView } from '../components/views/BenchmarkView/BenchmarkView';
import { CoolingPage } from "../panel/widgets/cooling/CoolingPage";
import { DashboardView } from '../components/views/DashboardView/DashboardView';
import { MonitoringPage } from "../panel/widgets/monitoring/MonitoringPage";
import { OpenInAppBanner } from '../components/common/OpenInAppBanner/OpenInAppBanner';
import { ToolsView } from '../components/views/ToolsView';
import { SettingsView } from '../components/views/SettingsView/SettingsView';
import { DevicesPage } from "../panel/widgets/devices/DevicesPage";
import { LightingPage } from "../panel/widgets/lighting/LightingPage";
import { ClockPage } from "../panel/widgets/clock/ClockPage";
import { loadMarketplaceWidgets } from '../widgets/marketplaceRegistry';
import { useServiceStatus } from '../hooks/useServiceStatus';
import { useServiceState } from '../hooks/useServiceState';
import { useProfiles } from '../hooks/useProfiles';
import { useRoute } from '../hooks/useRoute';
import { useBuilder } from '../hooks/useBuilder';
import { fetchPanelRemoteControlState } from '../api/panel';
import { MultiplexContext, useMultiplexConnection } from '../hooks/useMultiplexSocket';
import { UiSettingsProvider } from '../hooks/useUiSettings';
import { useTranslation } from '../lib/i18n';
import { applyThemeMode, applyAccentColor, cachePreferencesLocally } from '../lib/settings';
import type { Preferences } from '../api/profiles';
import type { Language, ThemeMode } from '../lib/settings';
import type { ComponentCategory, ComponentOption } from '../types/builder';
import { NAV_ICONS, PORTAL_NAV_KEYS } from './sidebarNav';
import {
  TopRightDebugButton,
  TopRightSettingsButton,
  PageVersionLabel,
} from './sidebar';
import { SidebarColumn } from './SidebarColumn';
import { CrossZoneDragProvider } from './CrossZoneDrag';
import { PairPhoneModal } from './PairPhoneModal';
import { IncomingPairModal } from './IncomingPairModal';
import { useMonitoringStoreBridge } from './monitoringBridge';
import { CaptionButtons } from './CaptionButtons';
import { isWindowsAppShell, postResizeStart, QOS_RESIZE_EDGES, type QosResizeEdge } from './windowActions';
import styles from '../App.module.scss';

const PORTAL_URL = 'https://nexusqos.com';

const BuilderView = lazy(() => import('../components/views/BuilderView'));

// Catches mousedown on a window-edge strip and IPCs the shell, which
// then posts WM_NCLBUTTONDOWN(hitCode) to its own HWND so the OS
// resize-drag loop takes over. Preventing default + stopping prop is
// what keeps the mousedown from racing the page's click handlers.
function ResizeStrip({ className, edge }: { className: string; edge: QosResizeEdge }) {
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
  const { section, view, subtab, componentId, fromCategory, navigate, setView, setSubtab, navigateToComponent } = useRoute();
  const [pendingDeviceKey, setPendingDeviceKey] = useState<string | null>(null);
  const status = useServiceStatus();
  const online = status.state === 'online';
  const multiplex = useMultiplexConnection(online);
  const serviceState = useServiceState(online, multiplex);
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
      pinnedSidebarApps: prefs.ui?.pinnedSidebarApps,
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

  // Mark <body> when running inside the Windows-app shell so portaled
  // chrome (modals, popovers) can reserve the top-right 138px caption-
  // button gutter without each consumer re-detecting the shell.
  useEffect(() => {
    document.body.classList.toggle('qos-shell-windows-app', isWindowsAppShell());
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
    // Keep the indicator honest even when another desktop window flips the
    // killswitch. 10 s is gentle - the modal itself is the high-frequency
    // surface, this only powers the sidebar dot color.
    const timer = window.setInterval(load, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [online]);
  // Auto-collapse threshold. Stays above the OS-enforced min window
  // width (1000px - see MinClientWidth in qos-overlay's DashboardWindow.cs)
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
  // "Expanded while narrow" override is transient — it stops mattering the
  // moment the viewport widens (auto would expand anyway), and clearing it
  // here means the *next* narrow trip re-applies auto-collapse instead of
  // sticking expanded forever. Manual *collapse* (override === true) is the
  // only preference that persists across width changes, so a user who likes
  // the compact sidebar on wide windows keeps it that way.
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
      case 'monitoring': return <MonitoringPage serviceOnline={online} connectionState={status.state} tab={subtab} onTabChange={setSubtab} />;
      case 'lighting':   return <LightingPage serviceOnline={online} serviceState={serviceState} connectionState={status.state} activeProfileId={profilesHook.activeId} />;
      case 'cooling':    return <CoolingPage serviceOnline={online} serviceState={serviceState} connectionState={status.state} activeProfileId={profilesHook.activeId} />;
      case 'devices':    return (
        <DevicesPage
          serviceOnline={online}
          connectionState={status.state}
          initialOpenKey={pendingDeviceKey}
          onInitialOpenConsumed={() => setPendingDeviceKey(null)}
        />
      );
      case 'clock':      return <ClockPage />;
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
      <CrossZoneDragProvider>
      <div className={classNames(styles.layout, {
        [styles.layoutCompact]: compact,
        [styles.layoutWindowsApp]: isWindowsAppShell(),
        [styles.layoutNoSidebar]: !hasSidebar,
      })}>
        <OpenInAppBanner />
        {/* Qos Windows shell only: top drag strip + custom caption buttons.
            The native system buttons can't paint here because the WebView2
            child HWND covers the parent's non-client area; we route clicks
            back to qos-overlay via window.chrome.webview.postMessage. */}
        {isWindowsAppShell() && (
          <>
            <div className={styles.windowDragStrip} aria-hidden />
            <ResizeStrip className={styles.windowResizeStripLeft} edge={QOS_RESIZE_EDGES.left} />
            <ResizeStrip className={styles.windowResizeStripRight} edge={QOS_RESIZE_EDGES.right} />
            <ResizeStrip className={styles.windowResizeStripTop} edge={QOS_RESIZE_EDGES.top} />
            <ResizeStrip className={styles.windowResizeStripBottom} edge={QOS_RESIZE_EDGES.bottom} />
            <ResizeStrip className={styles.windowResizeCornerTopLeft} edge={QOS_RESIZE_EDGES.topLeft} />
            {/* No top-right corner strip - the caption buttons occupy
                that corner. A 12x12 strip at z-index 61 would steal
                the rightmost ~12px of the close button. Users can
                still resize via the top edge or the right edge. */}
            <ResizeStrip className={styles.windowResizeCornerBottomLeft} edge={QOS_RESIZE_EDGES.bottomLeft} />
            <ResizeStrip className={styles.windowResizeCornerBottomRight} edge={QOS_RESIZE_EDGES.bottomRight} />
            <CaptionButtons />
          </>
        )}
        <TopRightDebugButton
          active={activeView === 'tools'}
          onDebug={() => navigate('my-computer', 'tools')}
          icon={NAV_ICONS['tools']}
        />
        <TopRightSettingsButton
          active={section === 'my-computer' && activeView === 'settings'}
          onClick={handleNavigateSettings}
          icon={NAV_ICONS['settings']}
        />
        <PageVersionLabel />
        {/* Body row: sidebar (my-computer only) + content */}
        <div className={styles.bodyRow}>
          {hasSidebar && (
            <SidebarColumn
              compact={compact}
              onToggleCompact={() => setManualOverride(!sidebarCompact)}
              online={online}
              connectionState={status.state}
              connectEpoch={connectEpoch}
              serviceState={serviceState}
              serviceNavActive={serviceNavActive}
              onServiceNavChange={handleServiceNavChange}
              portalNav={portalNav}
              portalNavActive={portalNavActive}
              onPortalNavChange={handlePortalNavChange}
              profiles={profilesHook}
              onPreferencesChanged={handlePreferencesChanged}
              onNavigateSettings={handleNavigateSettings}
              remoteControlEnabled={remoteControlEnabled}
              phoneSubscribers={serviceState.panel?.phoneSubscribers ?? 0}
              onPairPhoneOpen={() => setPairPhoneOpen(true)}
            />
          )}

          <div className={styles.mainColumn}>
            <div className={styles.content}>
              <ErrorBoundary key={`${section}/${view}`}>{renderContent()}</ErrorBoundary>
            </div>
          </div>
        </div>
        {/* Global incoming-pair prompt. Mounted at the layout root so the
            numeric-comparison Allow/Deny lands on top of any section the
            user is in, with no easy dismiss — must explicitly Allow or
            Deny. Pair Remote (managing paired devices, generating a new
            code/QR, toggling discoverability) stays in its own modal
            below, opened from the sidebar button. */}
        <IncomingPairModal />
        <PairPhoneModal
          open={pairPhoneOpen}
          connectedCount={serviceState.panel?.phoneSubscribers ?? 0}
          remoteEnabled={remoteControlEnabled}
          onRemoteEnabledChange={setRemoteControlEnabled}
          onClose={() => setPairPhoneOpen(false)}
        />
      </div>
      </CrossZoneDragProvider>
      </UiSettingsProvider>
    </MultiplexContext.Provider>
  );
}
