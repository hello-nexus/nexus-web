import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, Trash2, LayoutGrid, Palette, Settings, Download, AlertTriangle } from 'lucide-react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SIZE_ICONS } from '../../../panel/widgets/common/SizeIcons';
import { WidgetControlGroup } from '../../../panel/widgets/common/WidgetControlGroup';
import { slotCountOptionsForSize, resolvedSlotCountForSize } from '../../../panel/widgets/monitoring/perfSlots';
import { SlotCountIcon } from '../../../panel/widgets/monitoring/SlotCountIcons';
import {
  appendWidget,
  patchWidgetById,
  removeWidgetById,
  replaceWidget,
  tryResizeWidget,
} from '../../../panel/engine/panelLayoutOps';
import { MAX_PANEL_PAGES } from '../../../panel/engine/panelGrid';
import { normalizePanelLayout } from '../../../panel/engine/usePanelLayout';
import { isSingleWidgetSurface } from '../../../panel/types';
import { fetchService, postService } from '../../../api/service';
import { fetchDisplays, fetchDisplayTopology, rotateDisplay, setDisplayBrightness } from '../../../api/displays';
import { fetchPreferences, savePreferences } from '../../../api/profiles';
import {
  allocatePanelDevice,
  fetchPanelDevice,
  fetchPanelDevices,
  patchPanelDevice,
} from '../../../api/panel';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import { useTranslation } from '../../../lib/i18n';
import { createUuid } from '../../../lib/uuid';
import { IconLabelButton } from '../../common/IconLabelButton/IconLabelButton';
import { SettingSelect, SettingSlider, SettingToggle } from '../../common/SettingRow/SettingRow';
import { PanelEmbedFrame } from './PanelEmbedFrame';
import { QSeriesCoolerSettings } from './QSeriesCoolerSettings';
import { useFirmwareStatus } from '../../../hooks/useFirmwareStatus';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { Button } from '../../common/Button/Button';
import { PanelArrowButton } from '../../../panel/chrome/PanelArrowButton';
import { broadcastLayoutChanged } from '../../../panel/engine/panelSync';
import { usePanelTheme, useResolvedPanelThemeMode } from '../../../panel/theme/panelTheme';
import { PanelThemeSettings } from '../../../panel/editor/PanelThemeSettings';
import { lookupApp, sizesForSurface } from '../../../panel/widgets/registry';
import type { DeckEditView } from '../../../panel/widgets/types';
import { sizeToSpan } from '../../../panel/engine/grid';
import { ErrorBoundary } from '../../common/ErrorBoundary/ErrorBoundary';
import {
  type PanelLayout,
  type PanelSurface,
  type PanelWidget,
  type PanelWidgetSize,
  type PanelConfigValue,
} from '../../../panel/types';
import { isRemotePanel, type PanelDevice } from '../../../panel/device/panelDevices';
import { defaultLayoutForSurface } from '../../../panel/engine/defaultLayout';
import { PanelWidgetCatalog } from '../../../panel/editor/PanelWidgetCatalog';
import '../../../panel/styles/tokens.scss';
import styles from './PanelDevicePage.module.scss';

interface PanelDevicePageProps {
  device: PanelDevice;
  // Threaded from the app router (Dashboard); useRoute is per-instance, so a
  // navigate() owned here would update the URL but not drive the visible page.
  onOpenFirmware?: () => void;
}

interface BrightnessResponse { brightness: number }
interface RotationParams { orientation: string; forceOrientation: boolean }
interface ToggleResponse { toggle: boolean }

const Y70_ORIENTATIONS = ['Landscape', 'Portrait', 'LandscapeFlipped', 'PortraitFlipped'] as const;
type Y70Orientation = (typeof Y70_ORIENTATIONS)[number];

function normalizeOrientation(value: string | undefined | null): Y70Orientation {
  // The Y70 panel is a fixed portrait strip; an unset/unknown value defaults to
  // PortraitFlipped rather than landscape.
  if (!value) return 'PortraitFlipped';
  // Map legacy lowercase 'landscape' / 'portrait' to the Windows-style
  // PascalCase values the backend expects.
  const lower = value.toLowerCase();
  if (lower === 'portrait') return 'Portrait';
  if (lower === 'landscapeflipped' || lower === 'landscape_flipped') return 'LandscapeFlipped';
  if (lower === 'portraitflipped' || lower === 'portrait_flipped') return 'PortraitFlipped';
  if (lower === 'landscape') return 'Landscape';
  return (Y70_ORIENTATIONS as readonly string[]).includes(value)
    ? (value as Y70Orientation)
    : 'PortraitFlipped';
}

type Tab = 'widgets' | 'theme' | 'settings';

export function PanelDevicePage({ device, onOpenFirmware }: PanelDevicePageProps) {
  const { t } = useTranslation();
  const isQSeries = device?.runtimeSurface === 'q60';
  const { items: firmwareItems, loaded: firmwareLoaded } = useFirmwareStatus(isQSeries);
  const [tab, setTab] = useState<Tab>('widgets');
  const [brightness, setBrightness] = useState(50);
  const [orientation, setOrientation] = useState<Y70Orientation>('PortraitFlipped');
  const [forceOrientation, setForceOrientation] = useState(true);
  const [screenOn, setScreenOn] = useState(true);
  const [autoLaunch, setAutoLaunch] = useState(true);
  const [reserveMonitor, setReserveMonitor] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [layout, setLayout] = useState<PanelLayout>(() => defaultLayoutForSurface('y70'));
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  // Live canvas size reported by the kiosk's SPA via capabilities. Overrides
  // the hardcoded profile (which assumes a single Y70 model) so the simulator
  // iframe matches whatever Y70 variant + Windows DPI scaling is actually
  // attached.
  const [liveCanvas, setLiveCanvas] = useState<{ width: number; height: number } | null>(null);
  const [liveDpr, setLiveDpr] = useState<number | null>(null);
  const [configuringWidget, setConfiguringWidget] = useState<PanelWidget | null>(null);
  // One-shot flash request forwarded to the preview iframe when an edit is
  // rejected (a resize that can't fit). nonce re-fires repeat rejections.
  const [flashSignal, setFlashSignal] = useState<{ widgetId: string; nonce: number } | null>(null);
  // Per-panel persisted settings off the device record (promoted monitors).
  const [recordReserve, setRecordReserve] = useState(true);
  const [recordTouch, setRecordTouch] = useState<boolean | undefined>(undefined);
  const surface = device?.runtimeSurface ?? 'y70';
  const supportsDisplayControls = device?.capabilities.displayControls ?? surface === 'y70';
  const supportsAutoLaunch = device?.capabilities.launchClose ?? surface === 'y70';
  // Y70 connected as a monitor only (no USB serial channel): brightness and
  // screen power have no hardware path, but layout/theme/orientation still
  // work over the video connection.
  const usbDisconnected = device?.warning === 'usb-disconnected';
  // Serial/USB up but no video display attached: the panel has nothing to
  // render on, so prompt the user to connect the display cable.
  const displayDisconnected = device?.warning === 'display-disconnected';
  // Promoted monitor panels: bound to an OS display (per-panel reserve +
  // rotation live on the record / displays API).
  const isMonitorPanel = !!device?.displayId && !!device?.panelRecordId;
  // The record's touch flag is authoritative once loaded; the device entry's
  // UI capability seeds it for first paint.
  const deviceTouch = recordTouch ?? device?.capabilities.touch;
  // Promoted monitors with a DDC/CI-capable display get a brightness-only
  // settings tab wired to the generic /displays brightness endpoint.
  const [ddcBrightness, setDdcBrightness] = useState<number | null>(null);
  const ddcDisplayId = device?.displayId ?? null;
  useEffect(() => {
    if (!ddcDisplayId) return;
    let cancelled = false;
    fetchDisplays().then(list => {
      if (cancelled) return;
      const display = list?.displays.find(d => d.id === ddcDisplayId);
      if (display?.brightnessControl.supported) {
        setDdcBrightness(display.brightnessControl.current ?? 50);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [ddcDisplayId]);
  const ddcSupported = ddcDisplayId !== null && ddcBrightness !== null;
  // Rotation and the monitor-reserve guard exist only on hosts that
  // implement them (Windows); macOS/Linux monitor panels hide those rows.
  const [hostCaps, setHostCaps] = useState<{ rotation: boolean; reserve: boolean } | null>(null);
  useEffect(() => {
    if (!isMonitorPanel) return;
    let cancelled = false;
    fetchDisplayTopology().then(topo => {
      if (cancelled || !topo) return;
      setHostCaps({ rotation: topo.rotationSupported, reserve: topo.reserveSupported });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [isMonitorPanel]);
  const monitorRotation = isMonitorPanel && hostCaps?.rotation === true;
  const monitorReserve = isMonitorPanel && hostCaps?.reserve === true;
  const settingsAvailable = supportsDisplayControls || supportsAutoLaunch || ddcSupported
    || monitorRotation || monitorReserve
    // Q60 carries an AIO cooler, so its settings tab hosts the cooler firmware options.
    || surface === 'q60';
  const activeTab: Tab = tab === 'settings' && !settingsAvailable ? 'widgets' : tab;
  // Simulator and real hardware share one code path: theme, layout,
  // brightness, orientation, screen-on, and auto-launch all read/write the
  // service's persisted state.
  const panelTheme = usePanelTheme(editingDeviceId);
  const theme = panelTheme.theme;
  const effectiveThemeMode = theme.themeSyncWithDesktop
    ? (theme.appResolvedThemeMode || theme.appThemeMode)
    : theme.themeMode;
  const resolvedPanelThemeMode = useResolvedPanelThemeMode(effectiveThemeMode);
  // Desktop resolved mode from the app theme (concrete dark/light, not 'system').
  // Used for the widget preview in InlineWidgetSettings so it inherits the
  // desktop chrome's active theme instead of the panel theme.
  const desktopResolvedThemeMode = useResolvedPanelThemeMode(
    theme.appResolvedThemeMode || theme.appThemeMode,
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([
      supportsDisplayControls ? fetchService<BrightnessResponse>('/y70/brightness') : Promise.resolve(null),
      supportsDisplayControls ? fetchService<RotationParams>('/y70/rotation') : Promise.resolve(null),
      supportsDisplayControls ? fetchService<ToggleResponse>('/y70/toggle') : Promise.resolve(null),
      fetchPreferences(),
      fetchPanelDevices(),
    ]).then(([b, r, tog, prefs, devices]) => {
      if (cancelled) return;
      if (b) setBrightness(b.brightness);
      if (r) {
        setOrientation(normalizeOrientation(r.orientation));
        setForceOrientation(r.forceOrientation ?? true);
      }
      // /y70/toggle returns the persisted ScreenOff value, not "screen on".
      if (tog) setScreenOn(!tog.toggle);
      // Record-backed entries (promoted monitors) bind by their explicit
      // record id - several records share the 'monitor' surface, so a
      // surface scan would grab whichever was last seen. Everything else
      // (Y70 / Q-series / simulators) keeps the surface match: pick the most
      // recently active record for this surface (/panel/devices is sorted
      // by lastSeenAt desc).
      const match = device?.panelRecordId
        ? devices?.devices.find(d => d.id === device.panelRecordId)
        : devices?.devices.find(d => d.capabilities?.surface === surface);
      setEditingDeviceId(match?.id ?? null);
      const cw = match?.capabilities?.cssWidth;
      const ch = match?.capabilities?.cssHeight;
      setLiveCanvas(cw && ch ? { width: cw, height: ch } : null);
      setLiveDpr(match?.capabilities?.dpr ?? null);
      // Per-panel persisted settings (promoted monitors).
      setRecordReserve(match?.reserveMonitor ?? true);
      if (match?.capabilities?.orientation) setOrientation(normalizeOrientation(match.capabilities.orientation));
      const touchFromRecord = match?.capabilities?.touch ?? device?.capabilities.touch;
      setRecordTouch(match?.capabilities?.touch);
      const savedLayout = match?.layout ?? defaultLayoutForSurface(surface);
      setLayout(normalizePanelLayout(savedLayout, surface, touchFromRecord));
      if (prefs) {
        setAutoLaunch(prefs.panel?.autoLaunch ?? true);
        setReserveMonitor(prefs.panel?.reserveMonitor ?? true);
      }
      setLoaded(true);
    }).catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [surface, supportsDisplayControls, device?.panelRecordId, device?.capabilities.touch]);

  const pushBrightness = (value: number) => {
    setBrightness(value);
    if (!supportsDisplayControls) return;
    postService('/y70/brightness', { brightness: value }).catch(() => {});
  };

  const updateLayout = useCallback((next: PanelLayout) => {
    const normalized = normalizePanelLayout(next, surface, deviceTouch);
    setLayout(normalized);
    // Per-device editing path. If no device for this surface is registered
    // yet (no panel of this kind has ever connected), allocate one on first
    // edit so the user's changes persist.
    const persist = (id: string) =>
      patchPanelDevice(id, { layout: normalized })
        .then(() => broadcastLayoutChanged())
        .catch(() => {});
    if (editingDeviceId) {
      void persist(editingDeviceId);
      return;
    }
    void allocatePanelDevice({ surface }, `${surface} panel`).then(record => {
      if (record?.id) {
        setEditingDeviceId(record.id);
        return persist(record.id);
      }
    });
  }, [editingDeviceId, surface, deviceTouch]);

  // Reverse sync: when the physical panel (or another editor) saves a layout,
  // the service broadcasts panel/device with the changed id. Refetch this
  // device's record so the preview tracks on-device edits, not just edits made
  // here. PanelEmbedFrame's structural echo-guard makes the refetch from our
  // own writes a no-op. Mirrors usePanelLayout's panel/device subscription.
  useTopicCallback('panel/device', true, (raw) => {
    const frame = raw as { deviceId?: string } | null;
    if (!editingDeviceId || frame?.deviceId !== editingDeviceId) return;
    fetchPanelDevice(editingDeviceId).then(record => {
      if (!record) return;
      const cw = record.capabilities?.cssWidth;
      const ch = record.capabilities?.cssHeight;
      setLiveCanvas(cw && ch ? { width: cw, height: ch } : null);
      setLiveDpr(record.capabilities?.dpr ?? null);
      setLayout(normalizePanelLayout(record.layout ?? defaultLayoutForSurface(surface), surface, deviceTouch));
    }).catch(() => {});
  });

  // Editor capacity is the surface default - the live runtime may
  // recompute based on physical size. With explicit (col, row) the
  // user can place widgets anywhere within these bounds in the editor.
  const editorCapacity = useMemo(() => {
    if (surface === 'q60') return { gridCols: 2, pageRows: 4 };
    if (surface === 'desktop' || surface === 'monitor') return { gridCols: 8, pageRows: 6 };
    if (surface === 'y70') return { gridCols: 4, pageRows: 16 };
    return { gridCols: 4, pageRows: 16 };
  }, [surface]);

  const singleWidget = isSingleWidgetSurface(surface);
  const currentSingleWidget: PanelWidget | undefined = singleWidget
    ? layout.pages[0]?.widgets[0]
    : undefined;

  const handleAddWidget = useCallback((type: string, size: PanelWidgetSize) => {
    if (singleWidget) {
      // Single-widget surface (q-series): one widget at a time, fixed 2x4.
      // Clicking the catalog tile already on the device is a no-op.
      const current = layout.pages[0]?.widgets[0];
      if (current && current.type === type) return;
      const next: PanelWidget = {
        id: createUuid(),
        type,
        size,
        col: 0,
        row: 0,
      };
      updateLayout(replaceWidget(layout, next));
      return;
    }
    const next: PanelWidget = {
      id: createUuid(),
      type,
      size,
      col: 0,
      row: 0,
    };
    const appended = appendWidget(layout, next, editorCapacity);
    // Jump the preview to the page the widget landed on - appendWidget spills
    // to a later page when the active one is full, so the new tile would
    // otherwise appear off-screen.
    const landingPage = appended.pages.find(p => p.widgets.some(w => w.id === next.id));
    updateLayout(landingPage ? { ...appended, activePageId: landingPage.id } : appended);
  }, [editorCapacity, layout, singleWidget, updateLayout]);

  const handleRemoveWidget = useCallback((widgetId: string) => {
    updateLayout(removeWidgetById(layout, widgetId, editorCapacity));
  }, [editorCapacity, layout, updateLayout]);

  const handleConfigureWidget = useCallback((widget: PanelWidget) => {
    setConfiguringWidget(widget);
  }, []);

  const handleUpdateWidgetConfig = useCallback((widgetId: string, config: Record<string, PanelConfigValue>) => {
    updateLayout(patchWidgetById(layout, widgetId, w => ({ ...w, config }), editorCapacity));
    setConfiguringWidget(prev => prev?.id === widgetId ? { ...prev, config } : prev);
  }, [editorCapacity, layout, updateLayout]);

  const handleResizeWidget = useCallback((widgetId: string, size: PanelWidgetSize) => {
    // Cascade siblings across pages (creating pages up to MAX_PANEL_PAGES), the
    // same engine op the on-device runtime uses. An over-capacity page has no
    // identical representation across the runtime paginator (bounded rows) and
    // the editor normalizer (unbounded repack) - they ping-pong via the
    // simulator postMessage sync and the resize never settles, so a grow MUST
    // paginate, never overflow a page in place. null = the size can't fit
    // anywhere; reject it.
    const next = tryResizeWidget(layout, widgetId, size, editorCapacity, MAX_PANEL_PAGES);
    if (!next) {
      // Doesn't fit even after cascading across pages: flash the tile in the
      // preview rather than swallow the click silently.
      setFlashSignal(prev => ({ widgetId, nonce: (prev?.nonce ?? 0) + 1 }));
      return;
    }
    if (next === layout) return;
    updateLayout(next);
    setConfiguringWidget(prev => prev?.id === widgetId ? { ...prev, size } : prev);
  }, [editorCapacity, layout, updateLayout]);

  // Page navigation. The active page rides in layout.activePageId; writing it
  // moves the preview iframe (via set-layout) and the on-device panel (via the
  // panel/device refetch), keeping both in step. PanelContent maps the id back
  // to a page index on each surface.
  const goToPage = useCallback((delta: number) => {
    const pages = layout.pages;
    const cur = Math.max(0, layout.activePageId ? pages.findIndex(p => p.id === layout.activePageId) : 0);
    const next = Math.min(pages.length - 1, Math.max(0, cur + delta));
    if (next === cur) return;
    updateLayout({ ...layout, activePageId: pages[next].id });
  }, [layout, updateLayout]);

  const tabs: { key: Tab; label: string; icon: ReactNode }[] = [
    { key: 'widgets', label: t('devices.y70.tab.widgets'), icon: <LayoutGrid size={14} /> },
    { key: 'theme', label: t('devices.y70.tab.theme'), icon: <Palette size={14} /> },
    ...(settingsAvailable
      ? [{ key: 'settings' as const, label: t('devices.y70.tab.settings'), icon: <Settings size={14} /> }]
      : []),
  ];

  // Page title appends the localized "(Simulated)" suffix when the
  // device is a simulator. usePanelDevices keeps device.name bare
  // (so the sidebar entry stays compact: "Q60" / "Y70"), and the
  // suffix is applied here uniformly for every simulated panel.
  const isSimulated = device?.connectionKind === 'simulated';
  const baseTitle = device?.name ?? t('devices.y70.title');
  const pageTitle = isSimulated ? `${baseTitle}${t('devices.panels.simulatedSuffix')}` : baseTitle;

  const pageCount = layout.pages.length;
  const currentPageIndex = Math.max(0, layout.activePageId ? layout.pages.findIndex(p => p.id === layout.activePageId) : 0);
  const showPageArrows = !singleWidget && pageCount > 1;

  // Decide only after both the layout and the firmware status load, so the gate
  // resolves once instead of flashing block-then-content.
  const panelAppItem = firmwareItems.find(item => item.deviceType === 'qseries-app');
  const panelAppInstalled = !!panelAppItem && panelAppItem.currentVersion !== '';
  const fwGateReady = loaded && (!isQSeries || firmwareLoaded);
  const showFwGate = isQSeries && fwGateReady && !panelAppInstalled;

  return (
    <section className={styles.page}>
      <ViewHeader
        title={pageTitle}
        tabs={showFwGate ? undefined : tabs}
        activeTab={activeTab}
        onTabChange={(k) => { setConfiguringWidget(null); setTab(k as Tab); }}
      />
      <div className={`${styles.pageBody} pageBody`}>
      {!fwGateReady ? (
        <div style={{ color: 'var(--text-dim)', padding: 20 }}>{t('devices.loading')}</div>
      ) : showFwGate ? (
        <EmptyState
          icon={<Download size={48} />}
          title={t('devices.qseries.fwGate.title')}
          hint={t('devices.qseries.fwGate.hint')}
          action={
            <Button type="button" tone="accent" onClick={onOpenFirmware}>
              {t('devices.qseries.fwGate.cta')}
            </Button>
          }
        />
      ) : (
        <div className={styles.splitLayout}>
          {/* Options pane on the left; live preview on the right. */}
          <div className={styles.leftPane}>
            {configuringWidget ? (
              <InlineWidgetSettings
                key={configuringWidget.id}
                widget={configuringWidget}
                surface={surface}
                deviceTouch={deviceTouch}
                themeMode={desktopResolvedThemeMode}
                onBack={() => setConfiguringWidget(null)}
                onUpdate={handleUpdateWidgetConfig}
                onResize={handleResizeWidget}
                onRemove={(id) => { handleRemoveWidget(id); setConfiguringWidget(null); }}
              />
            ) : (
              <>
                <div className={`${styles.tabContent}${activeTab === 'widgets' ? ` ${styles.tabContentCatalog}` : ''}`}>
                  {activeTab === 'widgets' && (
                    <PanelWidgetCatalog
                      surface={surface}
                      deviceTouch={deviceTouch}
                      onAdd={handleAddWidget}
                      variant="desktop-modal"
                      remote={isRemotePanel(device?.connectionKind)}
                      className={styles.catalog}
                      selectedWidgetType={currentSingleWidget?.type}
                    />
                  )}
                  {activeTab === 'theme' && (() => {
                    // Aspect from live CSS viewport (DPR cancels); fall back to
                    // profile native pixels (both axes at same DPR, so ratio holds).
                    const cw = liveCanvas?.width ?? (surface === 'q60' ? 720 : 682);
                    const ch = liveCanvas?.height ?? (surface === 'q60' ? 1280 : 2560);
                    const devAspect = cw / ch;
                    // Bake target = the device's PHYSICAL resolution. The Q-series
                    // is fixed hardware at 720x1280, and its Android WebView already
                    // reports physical px in cssWidth (dpr is only render density),
                    // so do NOT multiply. The Y70 is Edge-on-Windows: cssWidth is
                    // logical px, so native = css * Windows display scaling (dpr).
                    const nativeW = surface === 'q60' ? 720 : (liveCanvas ? Math.round(cw * (liveDpr ?? 1)) : cw);
                    const nativeH = surface === 'q60' ? 1280 : (liveCanvas ? Math.round(ch * (liveDpr ?? 1)) : ch);
                    return (
                      <PanelThemeSettings
                        theme={theme}
                        deviceId={editingDeviceId}
                        resolvedThemeMode={resolvedPanelThemeMode}
                        onThemeSyncCommit={panelTheme.commitThemeSync}
                        onThemeModeCommit={panelTheme.commitThemeMode}
                        onAccentSyncCommit={panelTheme.commitAccentSync}
                        onAccentPreview={panelTheme.previewAccent}
                        onAccentCommit={panelTheme.commitAccent}
                        onBackgroundPreview={panelTheme.previewBackground}
                        onBackgroundCommit={panelTheme.commitBackground}
                        onBackgroundModeCommit={panelTheme.commitBackgroundMode}
                        onBackgroundEffectCommit={panelTheme.commitBackgroundEffect}
                        onBackgroundTemplateCommit={panelTheme.commitBackgroundTemplate}
                        onBackgroundEffectStatePreview={panelTheme.previewBackgroundEffectState}
                        onBackgroundEffectStateCommit={panelTheme.commitBackgroundEffectState}
                        onBackgroundOpacityPreview={panelTheme.previewBackgroundOpacity}
                        onBackgroundOpacityCommit={panelTheme.commitBackgroundOpacity}
                        onBackgroundMediaCommit={panelTheme.commitBackgroundMedia}
                        onWidgetOpacityPreview={panelTheme.previewWidgetOpacity}
                        onWidgetOpacityCommit={panelTheme.commitWidgetOpacity}
                        onWidgetLabelsCommit={panelTheme.commitWidgetLabels}
                        onWidgetBlurCommit={panelTheme.commitWidgetBlur}
                        showMediaTab={surface === 'y70' || surface === 'q60'}
                        deviceAspect={devAspect}
                        deviceW={nativeW}
                        deviceH={nativeH}
                        hideWidgetLabelsToggle={singleWidget}
                        hideWidgetChromeControls={singleWidget}
                      />
                    );
                  })()}
                  {activeTab === 'settings' && (isMonitorPanel || ddcSupported) && !supportsDisplayControls && !supportsAutoLaunch && (
                    <MonitorSettingsPanel
                      brightness={ddcSupported ? (ddcBrightness ?? 50) : null}
                      onBrightness={(value) => {
                        setDdcBrightness(value);
                        if (ddcDisplayId) void setDisplayBrightness(ddcDisplayId, value).catch(() => {});
                      }}
                      orientation={monitorRotation ? orientation : null}
                      onOrientation={(next) => {
                        setOrientation(next);
                        if (device?.displayId) void rotateDisplay(device.displayId, next).catch(() => {});
                      }}
                      orientationOptions={Y70_ORIENTATIONS}
                      reserveMonitor={monitorReserve ? recordReserve : null}
                      onReserveMonitorToggle={() => {
                        const next = !recordReserve;
                        setRecordReserve(next);
                        if (device?.panelRecordId) void patchPanelDevice(device.panelRecordId, { reserveMonitor: next }).catch(() => {});
                      }}
                    />
                  )}
                  {activeTab === 'settings' && (supportsDisplayControls || supportsAutoLaunch) && (
                    <SettingsPanel
                      brightness={brightness}
                      onBrightness={pushBrightness}
                      orientation={orientation}
                      onOrientation={(next) => {
                        setOrientation(next);
                        if (!supportsDisplayControls) return;
                        postService('/y70/rotation', { orientation: next }).catch(() => {});
                      }}
                      orientationOptions={Y70_ORIENTATIONS}
                      forceOrientation={forceOrientation}
                      onForceOrientationToggle={() => {
                        const next = !forceOrientation;
                        setForceOrientation(next);
                        if (!supportsDisplayControls) return;
                        postService('/y70/rotation', { forceOrientation: next }).catch(() => {});
                      }}
                      screenOn={screenOn}
                      onScreenToggle={() => {
                        const next = !screenOn;
                        setScreenOn(next);
                        if (!supportsDisplayControls) return;
                        postService('/y70/toggle', { toggle: !next }).catch(() => {});
                      }}
                      autoLaunch={autoLaunch}
                      onAutoLaunchToggle={() => {
                        const next = !autoLaunch;
                        setAutoLaunch(next);
                        if (!supportsAutoLaunch) return;
                        savePreferences({ panel: { autoLaunch: next } }).catch(() => {});
                      }}
                      reserveMonitor={reserveMonitor}
                      onReserveMonitorToggle={() => {
                        const next = !reserveMonitor;
                        setReserveMonitor(next);
                        if (!supportsAutoLaunch) return;
                        savePreferences({ panel: { reserveMonitor: next } }).catch(() => {});
                      }}
                      showDisplayControls={supportsDisplayControls}
                      showAutoLaunch={supportsAutoLaunch}
                      usbDisconnected={usbDisconnected}
                      displayDisconnected={displayDisconnected}
                    />
                  )}
                  {activeTab === 'settings' && surface === 'q60' && (
                    <QSeriesCoolerSettings />
                  )}
                </div>
              </>
            )}
          </div>

          <div className={styles.previewPane} data-surface={surface}>
            <div className={styles.previewStage}>
              {showPageArrows && (
                <PanelArrowButton
                  side="prev"
                  className={styles.pageArrow}
                  disabled={currentPageIndex <= 0}
                  onClick={() => goToPage(-1)}
                  ariaLabel={t('devices.panels.prevPage')}
                />
              )}
              {showPageArrows && (
                <PanelArrowButton
                  side="next"
                  className={styles.pageArrow}
                  disabled={currentPageIndex >= pageCount - 1}
                  onClick={() => goToPage(1)}
                  ariaLabel={t('devices.panels.nextPage')}
                />
              )}
              <PanelEmbedFrame
                surface={surface}
                layout={layout}
                theme={theme}
                themeMode={resolvedPanelThemeMode}
                selectedWidgetId={configuringWidget?.id ?? null}
                flashSignal={flashSignal}
                onLayoutChange={updateLayout}
                onWidgetClicked={handleConfigureWidget}
                onBackgroundClicked={() => setConfiguringWidget(null)}
                canvasSize={liveCanvas ?? device?.previewSize}
                canvasDpi={device?.previewDpi}
                canvasIsCssPixels={!!liveCanvas}
                brightness={supportsDisplayControls ? brightness : 100}
                screenOn={supportsDisplayControls ? screenOn : true}
                showPanel={supportsAutoLaunch ? autoLaunch : true}
                deviceId={editingDeviceId ?? undefined}
              />
            </div>
          </div>
        </div>
      )}
      </div>
    </section>
  );
}

// --- Inline Widget Settings (replaces left pane when editing a widget) ---

interface InlineWidgetSettingsProps {
  widget: PanelWidget;
  surface: PanelSurface;
  deviceTouch?: boolean;
  themeMode?: 'dark' | 'light';
  onBack: () => void;
  onUpdate: (widgetId: string, config: Record<string, PanelConfigValue>) => void;
  onResize: (widgetId: string, size: PanelWidgetSize) => void;
  onRemove: (widgetId: string) => void;
}

function InlineWidgetSettings({ widget, surface, deviceTouch, themeMode = 'dark', onBack, onUpdate, onResize, onRemove }: InlineWidgetSettingsProps) {
  const { t } = useTranslation();
  const def = lookupApp(widget.type);
  const widgetLabel = def ? (t(def.meta.i18nKey) || widget.type) : widget.type;
  const sizes = def ? sizesForSurface(def.meta, surface, deviceTouch) : [];
  const Settings = def?.Settings;
  const isMonitoringWidget = widget.type === 'monitoring';
  // Slot selection (clicking a sub-cell in the live preview to edit it) is a
  // manifest capability shared by monitoring and the deck, NOT a monitoring
  // type check. Gate the interactive preview + slot wiring on this flag.
  const usesSlotSelection = !!def?.meta.usesSlotSelection;
  const slotCountOptions = isMonitoringWidget ? slotCountOptionsForSize(widget.size) : [];
  const slotCount = resolvedSlotCountForSize(widget.size, widget.config?.slotCount as number | undefined);
  const [selectedMonitoringSlot, setSelectedMonitoringSlot] = useState(0);
  const [deckEditView, setDeckEditView] = useState<DeckEditView>({ folderPath: [] });

  const handleConfigUpdate = (config: Record<string, PanelConfigValue>) => {
    onUpdate(widget.id, { ...widget.config, ...config });
  };

  const handleResize = (size: PanelWidgetSize) => {
    setSelectedMonitoringSlot(slot => Math.min(slot, resolvedSlotCountForSize(size, widget.config?.slotCount as number | undefined) - 1));
    onResize(widget.id, size);
  };

  const handleSlotCount = (n: number) => {
    setSelectedMonitoringSlot(slot => Math.min(slot, n - 1));
    handleConfigUpdate({ slotCount: n });
  };

  const Icon = def?.meta.icon;

  return (
    <div className={styles.inlineSettings}>
      <div className={styles.inlineSettingsHeader}>
        <button type="button" className={styles.backBtn} onClick={onBack} aria-label={t('devices.panels.widgetSettings.back')}>
          <ArrowLeft size={16} />
        </button>
        <div className={styles.inlineSettingsTitle}>
          {Icon && <Icon size={16} />}
          <span>{widgetLabel}</span>
        </div>
        <div className={styles.inlineSettingsActions}>
          <button
            type="button"
            className={styles.inlineRemoveBtn}
            onClick={() => onRemove(widget.id)}
            aria-label={t('devices.panels.widgetSettings.remove')}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className={styles.inlineSettingsPreview}>
        {def && (() => {
          const Comp = def.Widget;
          const span = sizeToSpan(widget.size);
          const previewW = span.cols * 90 + (span.cols - 1) * 6;
          const previewH = span.rows * 90 + (span.rows - 1) * 6;
          return (
            <div
              className={`panel-root ${usesSlotSelection ? styles.inlineSettingsPreviewRootInteractive : styles.inlineSettingsPreviewRoot}`}
              data-theme={themeMode}
              style={{ width: previewW, height: previewH }}
            >
              <div className={`panel-card ${styles.inlineSettingsPreviewCard}`}>
                <ErrorBoundary label={widget.type}>
                  <Comp
                    widget={widget}
                    selectedSlot={usesSlotSelection ? selectedMonitoringSlot : undefined}
                    onSelectSlot={usesSlotSelection ? setSelectedMonitoringSlot : undefined}
                    editView={usesSlotSelection ? deckEditView : undefined}
                    onEditViewChange={usesSlotSelection ? setDeckEditView : undefined}
                  />
                </ErrorBoundary>
              </div>
            </div>
          );
        })()}
      </div>

      <div className={styles.inlineSettingsBody}>
        {(sizes.length > 1 || slotCountOptions.length > 1) && (
          <div className={styles.inlineControlsRow}>
            {sizes.length > 1 && (
              <WidgetControlGroup title={isMonitoringWidget ? t('devices.panels.widgetSettings.layout') : t('devices.panels.widgetSettings.size')}>
                {sizes.map(s => {
                  const SizeIcon = SIZE_ICONS[s];
                  return (
                    <IconLabelButton
                      key={s}
                      className={styles.inlineIconButton}
                      active={s === widget.size}
                      icon={SizeIcon ? <SizeIcon aria-hidden="true" /> : undefined}
                      ariaLabel={`${isMonitoringWidget ? t('devices.panels.widgetSettings.layout') : t('devices.panels.widgetSettings.size')} ${s}`}
                      onPress={() => handleResize(s)}
                      title={s}
                    />
                  );
                })}
              </WidgetControlGroup>
            )}
            {isMonitoringWidget && slotCountOptions.length > 0 && (
              <WidgetControlGroup title={t('devices.panels.widgetSettings.slots')}>
                {slotCountOptions.map(n => (
                  <IconLabelButton
                    key={n}
                    className={styles.inlineIconButton}
                    active={n === slotCount}
                    icon={<SlotCountIcon count={n} size={widget.size} aria-hidden="true" />}
                    ariaLabel={t('devices.panels.widgetSettings.slotCount', { count: n })}
                    title={t('devices.panels.widgetSettings.slotCount', { count: n })}
                    onPress={() => handleSlotCount(n)}
                  />
                ))}
              </WidgetControlGroup>
            )}
          </div>
        )}

        {Settings ? (
          <Settings
            widget={widget}
            surface={surface}
            desktopEditor
            onUpdate={handleConfigUpdate}
            onResize={handleResize}
            selectedSlot={usesSlotSelection ? selectedMonitoringSlot : undefined}
            onSelectedSlotChange={usesSlotSelection ? setSelectedMonitoringSlot : undefined}
            editView={usesSlotSelection ? deckEditView : undefined}
            onEditViewChange={usesSlotSelection ? setDeckEditView : undefined}
          />
        ) : (
          <div className={styles.inlineSettingsEmpty}>
            {t('peripheral.noCapabilities') || t('devices.panels.widgetSettings.noConfigurableSettings')}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Monitor (promoted display) settings ---
//
// Per-panel persisted settings for display-bound panels: DDC/CI brightness
// (when the monitor exposes it), OS rotation, and the per-record
// "keep panel clear of other windows" reserve. Null props hide a row.

interface MonitorSettingsPanelProps {
  brightness: number | null;
  onBrightness: (v: number) => void;
  orientation: Y70Orientation | null;
  onOrientation: (v: Y70Orientation) => void;
  orientationOptions: readonly Y70Orientation[];
  reserveMonitor: boolean | null;
  onReserveMonitorToggle: () => void;
}

function MonitorSettingsPanel({
  brightness, onBrightness,
  orientation, onOrientation, orientationOptions,
  reserveMonitor, onReserveMonitorToggle,
}: MonitorSettingsPanelProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.settingsContent}>
      <SettingsSection title={t('devices.y70.display')} boxClassName={styles.deviceSettingsBox}>
      {brightness !== null && (
        <SettingSlider
          editable
          trackFill
          label={t('devices.y70.brightness')}
          value={brightness}
          min={0}
          max={100}
          onChange={onBrightness}
          onCommit={onBrightness}
        />
      )}
      {orientation !== null && (
        <SettingSelect
          label={t('devices.y70.orientation')}
          value={orientation}
          onChange={(v) => onOrientation(v as Y70Orientation)}
          options={orientationOptions.map(o => ({
            value: o,
            label: t(`devices.y70.orientation.${o}`),
          }))}
        />
      )}
      {reserveMonitor !== null && (
        <SettingToggle
          label={t('devices.y70.reserveMonitor')}
          description={t('devices.y70.reserveMonitorHint')}
          checked={reserveMonitor}
          onChange={onReserveMonitorToggle}
        />
      )}
      </SettingsSection>
    </div>
  );
}

// --- Settings Panel ---

interface SettingsPanelProps {
  brightness: number;
  onBrightness: (v: number) => void;
  orientation: Y70Orientation;
  onOrientation: (v: Y70Orientation) => void;
  orientationOptions: readonly Y70Orientation[];
  forceOrientation: boolean;
  onForceOrientationToggle: () => void;
  screenOn: boolean;
  onScreenToggle: () => void;
  autoLaunch: boolean;
  onAutoLaunchToggle: () => void;
  reserveMonitor: boolean;
  onReserveMonitorToggle: () => void;
  showDisplayControls: boolean;
  showAutoLaunch: boolean;
  // Y70 connected as a monitor only (no USB serial channel): brightness and
  // screen power have no hardware path to apply to.
  usbDisconnected: boolean;
  // Y70 serial/USB up but no video display attached: nothing to render on.
  displayDisconnected: boolean;
}

function SettingsPanel({
  brightness, onBrightness,
  orientation, onOrientation, orientationOptions,
  forceOrientation, onForceOrientationToggle,
  screenOn, onScreenToggle,
  autoLaunch, onAutoLaunchToggle,
  reserveMonitor, onReserveMonitorToggle,
  showDisplayControls,
  showAutoLaunch,
  usbDisconnected,
  displayDisconnected,
}: SettingsPanelProps) {
  const { t } = useTranslation();

  return (
    <div className={styles.settingsContent}>
      {showDisplayControls && (
        <SettingsSection title={t('devices.y70.display')} boxClassName={styles.deviceSettingsBox}>
          {usbDisconnected && (
            <div className={styles.usbNotice}>
              <AlertTriangle size={14} aria-hidden />
              <span>{t('devices.y70.usbDisconnectedNotice')}</span>
            </div>
          )}

          {displayDisconnected && (
            <div className={styles.usbNotice}>
              <AlertTriangle size={14} aria-hidden />
              <span>{t('devices.y70.displayDisconnectedNotice')}</span>
            </div>
          )}

          <SettingToggle
            label={t('devices.y70.screen')}
            checked={screenOn}
            onChange={onScreenToggle}
            disabled={usbDisconnected}
          />

          <SettingSlider
            editable
            trackFill
            label={t('devices.y70.brightness')}
            value={brightness}
            min={0}
            max={100}
            onChange={onBrightness}
            onCommit={onBrightness}
            disabled={usbDisconnected}
          />

          <SettingToggle
            label={t('devices.y70.forceOrientation')}
            description={t('devices.y70.forceOrientationHint')}
            checked={forceOrientation}
            onChange={onForceOrientationToggle}
          />

          {!forceOrientation && (
            <SettingSelect
              label={t('devices.y70.orientation')}
              value={orientation}
              onChange={(v) => onOrientation(v as Y70Orientation)}
              options={orientationOptions.map(o => ({
                value: o,
                label: t(`devices.y70.orientation.${o}`),
              }))}
            />
          )}
        </SettingsSection>
      )}

      {showAutoLaunch && (
        <SettingsSection title={t('devices.y70.panel')} boxClassName={styles.deviceSettingsBox}>
          <SettingToggle
            label={t('devices.y70.panelAutoLaunch')}
            description={t('devices.y70.panelAutoLaunchHint')}
            checked={autoLaunch}
            onChange={onAutoLaunchToggle}
          />

          <SettingToggle
            label={t('devices.y70.reserveMonitor')}
            description={t('devices.y70.reserveMonitorHint')}
            checked={reserveMonitor}
            onChange={onReserveMonitorToggle}
          />
        </SettingsSection>
      )}
    </div>
  );
}
