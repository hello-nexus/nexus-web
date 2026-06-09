import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { SectionHeader } from '../../common/SectionHeader/SectionHeader';
import { SIZE_ICONS } from '../../../panel/widgets/common/SizeIcons';
import { WidgetControlGroup } from '../../../panel/widgets/common/WidgetControlGroup';
import { slotCountOptionsForSize, resolvedSlotCountForSize } from '../../../panel/widgets/monitoring/perfSlots';
import { SlotCountIcon } from '../../../panel/widgets/monitoring/SlotCountIcons';
import { appendWidget, replaceWidget } from '../../../panel/engine/panelLayoutOps';
import { normalizePanelLayout } from '../../../panel/engine/usePanelLayout';
import { isSingleWidgetSurface } from '../../../panel/types';
import { fetchService, postService } from '../../../api/service';
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
import { Select } from '../../common/Select/Select';
import { Slider } from '../../common/Slider/Slider';
import { Toggle } from '../../common/Toggle/Toggle';
import { PanelEmbedFrame } from './PanelEmbedFrame';
import { PanelArrowButton } from '../../../panel/PanelArrowButton';
import { broadcastLayoutChanged } from '../../../panel/engine/panelSync';
import { buildPanelThemeVars, usePanelTheme, useResolvedPanelThemeMode } from '../../../panel/panelTheme';
import { PanelThemeSettings } from '../../../panel/editor/PanelThemeSettings';
import { lookupApp, sizesForSurface } from '../../../panel/widgets/registry';
import { sizeToSpan } from '../../../panel/engine/grid';
import { ErrorBoundary } from '../../common/ErrorBoundary/ErrorBoundary';
import {
  type PanelLayout,
  type PanelSurface,
  type PanelWidget,
  type PanelWidgetSize,
  type PanelConfigValue,
} from '../../../panel/types';
import { isRemotePanel, type PanelDevice } from '../../../panel/panelDevices';
import { defaultLayoutForSurface } from '../../../panel/engine/defaultLayout';
import { PanelWidgetCatalog } from '../../../panel/editor/PanelWidgetCatalog';
import '../../../panel/styles/tokens.scss';
import styles from './PanelDevicePage.module.scss';

interface PanelDevicePageProps {
  device: PanelDevice;
}

interface BrightnessResponse { brightness: number }
interface RotationParams { orientation: string }
interface ToggleResponse { toggle: boolean }

const Y70_ORIENTATIONS = ['Landscape', 'Portrait', 'LandscapeFlipped', 'PortraitFlipped'] as const;
type Y70Orientation = (typeof Y70_ORIENTATIONS)[number];

function normalizeOrientation(value: string | undefined | null): Y70Orientation {
  if (!value) return 'Landscape';
  // Map legacy lowercase 'landscape' / 'portrait' to the Windows-style
  // PascalCase values the backend expects.
  const lower = value.toLowerCase();
  if (lower === 'portrait') return 'Portrait';
  if (lower === 'landscapeflipped' || lower === 'landscape_flipped') return 'LandscapeFlipped';
  if (lower === 'portraitflipped' || lower === 'portrait_flipped') return 'PortraitFlipped';
  if (lower === 'landscape') return 'Landscape';
  return (Y70_ORIENTATIONS as readonly string[]).includes(value)
    ? (value as Y70Orientation)
    : 'Landscape';
}

type Tab = 'widgets' | 'theme' | 'settings';

export function PanelDevicePage({ device }: PanelDevicePageProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('widgets');
  const [brightness, setBrightness] = useState(50);
  const [orientation, setOrientation] = useState<Y70Orientation>('Landscape');
  const [screenOn, setScreenOn] = useState(true);
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [reserveMonitor, setReserveMonitor] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [layout, setLayout] = useState<PanelLayout>(() => defaultLayoutForSurface('y70'));
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  // Live canvas size reported by the kiosk's SPA via capabilities. Overrides
  // the hardcoded profile (which assumes a single Y70 model) so the simulator
  // iframe matches whatever Y70 variant + Windows DPI scaling is actually
  // attached.
  const [liveCanvas, setLiveCanvas] = useState<{ width: number; height: number } | null>(null);
  const [configuringWidget, setConfiguringWidget] = useState<PanelWidget | null>(null);
  const surface = device?.runtimeSurface ?? 'y70';
  const supportsDisplayControls = device?.capabilities.displayControls ?? surface === 'y70';
  const supportsAutoLaunch = device?.capabilities.launchClose ?? surface === 'y70';
  const settingsAvailable = supportsDisplayControls || supportsAutoLaunch;
  const activeTab: Tab = tab === 'settings' && !settingsAvailable ? 'widgets' : tab;
  // Simulator and real hardware share one code path: theme, layout,
  // brightness, orientation, screen-on, and auto-launch all read/write the
  // service's persisted state.
  const panelTheme = usePanelTheme(editingDeviceId);
  const theme = panelTheme.theme;
  const effectiveThemeMode = theme.themeSyncWithDesktop ? theme.appThemeMode : theme.themeMode;
  const resolvedPanelThemeMode = useResolvedPanelThemeMode(effectiveThemeMode);
  // CSS variables driving the panel theme (--panel-accent and the full
  // --accent family). This page lives in desktop chrome where --accent is
  // the desktop accent, so descendants reaching for --accent (SearchInput,
  // widget previews) would highlight in the wrong hue. Threading these vars
  // into the catalog + widget preview wrappers below honors the panel accent.
  const panelThemeVars = useMemo(
    () => buildPanelThemeVars(theme, resolvedPanelThemeMode),
    [theme, resolvedPanelThemeMode],
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
      if (r) setOrientation(normalizeOrientation(r.orientation));
      // /y70/toggle returns the persisted ScreenOff value, not "screen on".
      if (tog) setScreenOn(!tog.toggle);
      // Pick the most recently active device record matching this modal's
      // surface. The /panel/devices list is sorted by lastSeenAt desc.
      const match = devices?.devices.find(d => d.capabilities?.surface === surface);
      setEditingDeviceId(match?.id ?? null);
      const cw = match?.capabilities?.cssWidth;
      const ch = match?.capabilities?.cssHeight;
      setLiveCanvas(cw && ch ? { width: cw, height: ch } : null);
      const savedLayout = match?.layout ?? defaultLayoutForSurface(surface);
      setLayout(normalizePanelLayout(savedLayout, surface));
      if (prefs) {
        setAutoLaunch(prefs.panel?.autoLaunch ?? false);
        setReserveMonitor(prefs.panel?.reserveMonitor ?? true);
      }
      setLoaded(true);
    }).catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [surface, supportsDisplayControls]);

  const pushBrightness = (value: number) => {
    setBrightness(value);
    if (!supportsDisplayControls) return;
    postService('/y70/brightness', { brightness: value }).catch(() => {});
  };

  const updateLayout = useCallback((next: PanelLayout) => {
    const normalized = normalizePanelLayout(next, surface);
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
  }, [editingDeviceId, surface]);

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
      setLayout(normalizePanelLayout(record.layout ?? defaultLayoutForSurface(surface), surface));
    }).catch(() => {});
  });

  // Editor capacity is the surface default - the live runtime may
  // recompute based on physical size. With explicit (col, row) the
  // user can place widgets anywhere within these bounds in the editor.
  const editorCapacity = (() => {
    if (surface === 'q60') return { gridCols: 2, pageRows: 4 };
    if (surface === 'desktop') return { gridCols: 8, pageRows: 6 };
    if (surface === 'y70') return { gridCols: 4, pageRows: 12 };
    return { gridCols: 4, pageRows: 16 };
  })();

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
    updateLayout(appendWidget(layout, next, editorCapacity));
  }, [editorCapacity, layout, singleWidget, updateLayout]);

  const handleRemoveWidget = useCallback((widgetId: string) => {
    const page = layout.pages[0];
    if (!page) return;
    updateLayout({
      ...layout,
      pages: [{ ...page, widgets: page.widgets.filter(w => w.id !== widgetId) }],
    });
  }, [layout, updateLayout]);

  const handleConfigureWidget = useCallback((widget: PanelWidget) => {
    setConfiguringWidget(widget);
  }, []);

  const handleUpdateWidgetConfig = useCallback((widgetId: string, config: Record<string, PanelConfigValue>) => {
    const page = layout.pages[0];
    if (!page) return;
    const next: PanelLayout = {
      ...layout,
      pages: [{
        ...page,
        widgets: page.widgets.map(w =>
          w.id === widgetId ? { ...w, config } : w,
        ),
      }],
    };
    updateLayout(next);
    setConfiguringWidget(prev => prev?.id === widgetId ? { ...prev, config } : prev);
  }, [layout, updateLayout]);

  const handleResizeWidget = useCallback((widgetId: string, size: PanelWidgetSize) => {
    const page = layout.pages[0];
    if (!page) return;
    const current = page.widgets.find(w => w.id === widgetId);
    if (!current || current.size === size) return;
    const next: PanelLayout = {
      ...layout,
      pages: [{
        ...page,
        widgets: page.widgets.map(w =>
          w.id === widgetId ? { ...w, size } : w,
        ),
      }],
    };
    updateLayout(next);
    setConfiguringWidget(prev => prev?.id === widgetId ? { ...prev, size } : prev);
  }, [layout, updateLayout]);

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

  const tabs: { key: Tab; label: string }[] = [
    { key: 'widgets', label: t('devices.y70.tab.widgets') },
    { key: 'theme', label: t('devices.y70.tab.theme') },
    ...(settingsAvailable
      ? [{ key: 'settings' as const, label: t('devices.y70.tab.settings') }]
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

  return (
    <section className={styles.page}>
      <ViewHeader
        title={pageTitle}
        tabs={configuringWidget ? undefined : tabs}
        activeTab={activeTab}
        onTabChange={(k) => setTab(k as Tab)}
      />
      <div className={styles.pageBody}>
      {!loaded ? (
        <div style={{ color: 'var(--text-dim)', padding: 20 }}>{t('devices.loading')}</div>
      ) : (
        <div className={styles.splitLayout}>
          <div className={styles.leftPane}>
            {configuringWidget ? (
              <InlineWidgetSettings
                key={configuringWidget.id}
                widget={configuringWidget}
                surface={surface}
                themeStyle={panelThemeVars}
                themeMode={resolvedPanelThemeMode}
                onBack={() => setConfiguringWidget(null)}
                onUpdate={handleUpdateWidgetConfig}
                onResize={handleResizeWidget}
                onRemove={(id) => { handleRemoveWidget(id); setConfiguringWidget(null); }}
              />
            ) : (
              <>
                <div className={styles.tabContent}>
                  {activeTab === 'widgets' && (
                    <PanelWidgetCatalog
                      surface={surface}
                      onAdd={handleAddWidget}
                      variant="desktop-modal"
                      remote={isRemotePanel(device?.connectionKind)}
                      themeMode={resolvedPanelThemeMode}
                      themeStyle={panelThemeVars}
                      className={styles.catalog}
                      selectedWidgetType={currentSingleWidget?.type}
                    />
                  )}
                  {activeTab === 'theme' && (
                    <PanelThemeSettings
                      theme={theme}
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
                      onWidgetOpacityPreview={panelTheme.previewWidgetOpacity}
                      onWidgetOpacityCommit={panelTheme.commitWidgetOpacity}
                      onWidgetLabelsCommit={panelTheme.commitWidgetLabels}
                      onWidgetBlurCommit={panelTheme.commitWidgetBlur}
                      hideWidgetLabelsToggle={singleWidget}
                    />
                  )}
                  {activeTab === 'settings' && (
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
                    />
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
                onLayoutChange={updateLayout}
                onWidgetClicked={handleConfigureWidget}
                onBackgroundClicked={() => setConfiguringWidget(null)}
                canvasSize={liveCanvas ?? device?.previewSize}
                canvasDpi={device?.previewDpi}
                canvasIsCssPixels={!!liveCanvas}
                brightness={supportsDisplayControls ? brightness : 100}
                screenOn={supportsDisplayControls ? screenOn : true}
                showPanel={supportsAutoLaunch ? autoLaunch : true}
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
  themeStyle?: CSSProperties;
  themeMode?: 'dark' | 'light';
  onBack: () => void;
  onUpdate: (widgetId: string, config: Record<string, PanelConfigValue>) => void;
  onResize: (widgetId: string, size: PanelWidgetSize) => void;
  onRemove: (widgetId: string) => void;
}

function InlineWidgetSettings({ widget, surface, themeStyle, themeMode = 'dark', onBack, onUpdate, onResize, onRemove }: InlineWidgetSettingsProps) {
  const { t } = useTranslation();
  const def = lookupApp(widget.type);
  const widgetLabel = def ? (t(def.meta.i18nKey) || widget.type) : widget.type;
  const sizes = def ? sizesForSurface(def.meta, surface) : [];
  const Settings = def?.Settings;
  const isMonitoringWidget = widget.type === 'monitoring';
  const slotCountOptions = isMonitoringWidget ? slotCountOptionsForSize(widget.size) : [];
  const slotCount = resolvedSlotCountForSize(widget.size, widget.config?.slotCount as number | undefined);
  const [selectedMonitoringSlot, setSelectedMonitoringSlot] = useState(0);

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
        <button type="button" className={styles.backBtn} onClick={onBack} aria-label="Back">
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
            aria-label="Remove"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {(sizes.length > 1 || slotCountOptions.length > 1) && (
        <div className={styles.inlineControlsRow}>
          {sizes.length > 1 && (
            <WidgetControlGroup title={isMonitoringWidget ? 'Layout' : 'Size'}>
              {sizes.map(s => {
                const SizeIcon = SIZE_ICONS[s];
                return (
                  <IconLabelButton
                    key={s}
                    className={styles.inlineIconButton}
                    active={s === widget.size}
                    icon={SizeIcon ? <SizeIcon aria-hidden="true" /> : undefined}
                    ariaLabel={`${isMonitoringWidget ? 'Layout' : 'Size'} ${s}`}
                    onPress={() => handleResize(s)}
                    title={s}
                  />
                );
              })}
            </WidgetControlGroup>
          )}
          {isMonitoringWidget && slotCountOptions.length > 0 && (
            <WidgetControlGroup title="Slots">
              {slotCountOptions.map(n => (
                <IconLabelButton
                  key={n}
                  className={styles.inlineIconButton}
                  active={n === slotCount}
                  icon={<SlotCountIcon count={n} size={widget.size} aria-hidden="true" />}
                  ariaLabel={`${n} ${n === 1 ? 'slot' : 'slots'}`}
                  title={`${n} ${n === 1 ? 'slot' : 'slots'}`}
                  onPress={() => handleSlotCount(n)}
                />
              ))}
            </WidgetControlGroup>
          )}
        </div>
      )}

      <div className={styles.inlineSettingsPreview}>
        {def && (() => {
          const Comp = def.Widget;
          const span = sizeToSpan(widget.size);
          const previewW = span.cols * 90 + (span.cols - 1) * 6;
          const previewH = span.rows * 90 + (span.rows - 1) * 6;
          return (
            <div
              className={`panel-root ${isMonitoringWidget ? styles.inlineSettingsPreviewRootInteractive : styles.inlineSettingsPreviewRoot}`}
              data-theme={themeMode}
              style={{ width: previewW, height: previewH, ...themeStyle }}
            >
              <div className={`panel-card ${styles.inlineSettingsPreviewCard}`}>
                <ErrorBoundary label={widget.type}>
                  <Comp
                    widget={widget}
                    selectedSlot={isMonitoringWidget ? selectedMonitoringSlot : undefined}
                    onSelectSlot={isMonitoringWidget ? setSelectedMonitoringSlot : undefined}
                  />
                </ErrorBoundary>
              </div>
            </div>
          );
        })()}
      </div>

      {Settings ? (
        <div className={styles.inlineSettingsBody}>
          <Settings
            widget={widget}
            onUpdate={handleConfigUpdate}
            onResize={handleResize}
            selectedSlot={isMonitoringWidget ? selectedMonitoringSlot : undefined}
            onSelectedSlotChange={isMonitoringWidget ? setSelectedMonitoringSlot : undefined}
          />
        </div>
      ) : (
        <div className={styles.inlineSettingsEmpty}>
          {t('peripheral.noCapabilities') || 'No configurable settings.'}
        </div>
      )}
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
  screenOn: boolean;
  onScreenToggle: () => void;
  autoLaunch: boolean;
  onAutoLaunchToggle: () => void;
  reserveMonitor: boolean;
  onReserveMonitorToggle: () => void;
  showDisplayControls: boolean;
  showAutoLaunch: boolean;
}

function SettingsPanel({
  brightness, onBrightness,
  orientation, onOrientation, orientationOptions,
  screenOn, onScreenToggle,
  autoLaunch, onAutoLaunchToggle,
  reserveMonitor, onReserveMonitorToggle,
  showDisplayControls,
  showAutoLaunch,
}: SettingsPanelProps) {
  const { t } = useTranslation();

  return (
    <div className={styles.settingsContent}>
      {showDisplayControls && (
        <>
          <SectionHeader>{t('devices.y70.display')}</SectionHeader>

          <div className="device-modal-row">
            <div className="device-modal-label">{t('devices.y70.brightness')}</div>
            <div className={styles.brightnessControl}>
              <Slider
                orientation="bare"
                min={0}
                max={100}
                value={brightness}
                trackFill={brightness}
                onChange={onBrightness}
                ariaLabel={t('devices.y70.brightness')}
                className={styles.brightnessSlider}
              />
              <span className={styles.brightnessValue}>{brightness}</span>
            </div>
          </div>

          <div className="device-modal-row">
            <div className="device-modal-label">{t('devices.y70.orientation')}</div>
            <Select
              value={orientation}
              onChange={(v) => onOrientation(v as Y70Orientation)}
              options={orientationOptions.map(o => ({
                value: o,
                label: t(`devices.y70.orientation.${o}`),
              }))}
              ariaLabel={t('devices.y70.orientation')}
              size="sm"
            />
          </div>

          <div className="device-modal-row">
            <div>
              <div className="device-modal-label">{t('devices.y70.screen')}</div>
              <div className="device-modal-hint">{screenOn ? 'On' : 'Off'}</div>
            </div>
            <Toggle checked={screenOn} onChange={onScreenToggle} ariaLabel={t('devices.y70.screen')} />
          </div>
        </>
      )}

      {showAutoLaunch && (
        <SectionHeader style={{ marginTop: showDisplayControls ? 8 : 0 }}>{t('devices.y70.panel')}</SectionHeader>
      )}

      {showAutoLaunch && (
        <div className="device-modal-row">
          <div>
            <div className="device-modal-label">{t('devices.y70.panelAutoLaunch')}</div>
            <div className="device-modal-hint">{t('devices.y70.panelAutoLaunchHint')}</div>
          </div>
          <Toggle checked={autoLaunch} onChange={onAutoLaunchToggle} ariaLabel={t('devices.y70.panelAutoLaunch')} />
        </div>
      )}

      {showAutoLaunch && (
        <div className="device-modal-row">
          <div>
            <div className="device-modal-label">{t('devices.y70.reserveMonitor')}</div>
            <div className="device-modal-hint">{t('devices.y70.reserveMonitorHint')}</div>
          </div>
          <Toggle checked={reserveMonitor} onChange={onReserveMonitorToggle} ariaLabel={t('devices.y70.reserveMonitor')} />
        </div>
      )}
    </div>
  );
}
