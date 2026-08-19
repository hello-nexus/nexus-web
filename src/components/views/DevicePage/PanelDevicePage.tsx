import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowLeft, Trash2, LayoutGrid, Palette, Settings, Download, AlertTriangle, Unplug, Camera } from 'lucide-react';
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
  swapSingleWidget,
  tryResizeWidget,
} from '../../../panel/engine/panelLayoutOps';
import { DEFAULT_SURFACE_DPI, MAX_PANEL_PAGES } from '../../../panel/engine/panelGrid';
import {
  panelGridCapacityForCanvas,
  panelWidgetPaddingRatio,
  PANEL_GRID_COLS,
  PANEL_Y70_LONG_AXIS_CELLS,
} from '../../../panel/engine/grid';
import { normalizePanelWidgetPadding } from '../../../panel/background/panelBackground';
import { normalizePanelLayout } from '../../../panel/engine/usePanelLayout';
import { repaginatePanelLayout } from '../../../panel/engine/paginate';
import { simulatedPanelEditorCapacity } from '../../../panel/embed/simulatedPanelViewport';
import { getPanelGridSizingSettings } from '../../../lib/panelSimulation';
import { isSingleWidgetSurface } from '../../../panel/types';
import { supportsDesktopWallpaper } from '../../../panel/device/wiredPanel';
import { fetchService, postService } from '../../../api/service';
import {
  fetchDisplays,
  fetchDisplayTopology,
  fetchXeneonEdgeSettings,
  launchTouchSetupWizard,
  repairTouchMapping,
  rotateDisplay,
  setDisplayBrightness,
  setXeneonEdgeSettings,
  type XeneonEdgeSettings,
} from '../../../api/displays';
import { fetchPreferences, savePreferences } from '../../../api/profiles';
import {
  allocatePanelDevice,
  fetchPanelDevice,
  fetchPanelDevices,
  patchPanelDevice,
  resetPanelDevice,
  resetPanelDeviceHardware,
} from '../../../api/panel';
import {
  getQSeriesRotation,
  setQSeriesRotation,
  getQSeriesDisplay,
  setQSeriesDisplay,
  type QSeriesOrientation,
} from '../../../api/qseries';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import { useTranslation } from '../../../lib/i18n';
import { createUuid } from '../../../lib/uuid';
import { IconLabelButton } from '../../common/IconLabelButton/IconLabelButton';
import { SettingRow, SettingSelect, SettingSlider, SettingToggle } from '../../common/SettingRow/SettingRow';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { useToast, useToastSafe } from '../../common/Toast/Toast';
import { PanelEmbedFrame, type PanelEmbedFrameHandle } from './PanelEmbedFrame';
import { resolvePanelNativeCanvas } from '../../../panel/embed/panelNativeCanvas';
import { saveBlobToFile } from '../../../lib/saveFile';
import { sanitizeFileName } from '../../../panel/widgets/lighting/page/mappingUtils';
import { QSeriesCoolerSettings } from './QSeriesCoolerSettings';
import { useFirmwareStatus } from '../../../hooks/useFirmwareStatus';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { Button } from '../../common/Button/Button';
import { PanelArrowButton } from '../../../panel/chrome/PanelArrowButton';
import { broadcastLayoutChanged } from '../../../panel/engine/panelSync';
import { buildPanelThemeVars, usePanelTheme, useResolvedPanelThemeMode } from '../../../panel/theme/panelTheme';
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
  // Deep-link a widget's edit sheet to a dashboard section (e.g. the gallery
  // widget's "Manage gallery" button opening the gallery page).
  onSectionNavigate?: (section: string) => void;
}

interface BrightnessResponse { brightness: number }
interface RotationParams { orientation: string; forceOrientation: boolean }
interface ToggleResponse { toggle: boolean }

const Y70_ORIENTATIONS = ['Landscape', 'Portrait', 'LandscapeFlipped', 'PortraitFlipped'] as const;
type Y70Orientation = (typeof Y70_ORIENTATIONS)[number];

// Q60/Q80 mount portrait or portrait-flipped only; no landscape orientation exists.
const QSERIES_ORIENTATIONS: readonly Y70Orientation[] = ['Portrait', 'PortraitFlipped'];

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

const TOUCH_REPAIR_ERROR_STATUSES = ['noPanel', 'noDigitizer', 'noHelper', 'failed'] as const;
type TouchRepairErrorStatus = (typeof TOUCH_REPAIR_ERROR_STATUSES)[number];

function toTouchRepairErrorStatus(status: string): TouchRepairErrorStatus {
  return (TOUCH_REPAIR_ERROR_STATUSES as readonly string[]).includes(status)
    ? (status as TouchRepairErrorStatus)
    : 'failed';
}

type Tab = 'widgets' | 'theme' | 'settings';

type XeneonEdgeControlKey = 'brightness' | 'backlight' | 'contrast' | 'red' | 'green' | 'blue';

interface XeneonEdgeSettingsValues {
  brightness: number;
  backlight: number;
  contrast: number;
  red: number;
  green: number;
  blue: number;
}

// Bench-measured factory defaults (nexus-service XeneonEdgeDefaults); used
// only as a fallback if a settings read comes back with an unset field.
const XENEON_EDGE_DEFAULTS: XeneonEdgeSettingsValues = {
  brightness: 50,
  backlight: 100,
  contrast: 50,
  red: 151,
  green: 127,
  blue: 139,
};

function xeneonEdgePatchFor(key: XeneonEdgeControlKey, value: number): Partial<XeneonEdgeSettings> {
  switch (key) {
    case 'brightness': return { brightness: value };
    case 'backlight': return { backlight: value };
    case 'contrast': return { contrast: value };
    case 'red': return { red: value };
    case 'green': return { green: value };
    case 'blue': return { blue: value };
  }
}

const XENEON_EDGE_CONTROLS: { key: XeneonEdgeControlKey; labelKey: string; min: number; max: number }[] = [
  { key: 'brightness', labelKey: 'devices.y70.brightness', min: 0, max: 100 },
  { key: 'backlight', labelKey: 'devices.xeneonEdge.backlight', min: 0, max: 100 },
  { key: 'contrast', labelKey: 'devices.xeneonEdge.contrast', min: 0, max: 100 },
  { key: 'red', labelKey: 'devices.xeneonEdge.red', min: 0, max: 255 },
  { key: 'green', labelKey: 'devices.xeneonEdge.green', min: 0, max: 255 },
  { key: 'blue', labelKey: 'devices.xeneonEdge.blue', min: 0, max: 255 },
];

export function PanelDevicePage({ device, onOpenFirmware, onSectionNavigate }: PanelDevicePageProps) {
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
  const [qSeriesBrightness, setQSeriesBrightness] = useState(100);
  const [qSeriesScreenOff, setQSeriesScreenOff] = useState(false);
  const [qSeriesSleepWithHost, setQSeriesSleepWithHost] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [layout, setLayout] = useState<PanelLayout>(() => defaultLayoutForSurface('y70'));
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  // Live canvas size reported by the kiosk's SPA via capabilities. Overrides
  // the hardcoded profile (which assumes a single Y70 model) so the simulator
  // iframe matches whatever Y70 variant + Windows DPI scaling is actually
  // attached.
  const [liveCanvas, setLiveCanvas] = useState<{ width: number; height: number } | null>(null);
  const [liveDpr, setLiveDpr] = useState<number | null>(null);
  // Physical density from the record (capabilities.dpi, curated known
  // displays like the Xeneon Edge); null falls back to the surface default.
  const [liveDpi, setLiveDpi] = useState<number | null>(null);
  const [configuringWidget, setConfiguringWidget] = useState<PanelWidget | null>(null);
  const embedFrameRef = useRef<PanelEmbedFrameHandle | null>(null);
  const [screenshotBusy, setScreenshotBusy] = useState(false);
  const [resetPersonalizationConfirmOpen, setResetPersonalizationConfirmOpen] = useState(false);
  const [resettingPersonalization, setResettingPersonalization] = useState(false);
  const [resetHardwareConfirmOpen, setResetHardwareConfirmOpen] = useState(false);
  const [resettingHardware, setResettingHardware] = useState(false);
  // Bumped after a hardware reset so the settings-load effect AND the Xeneon
  // DDC fetch effect re-read the now-defaulted state from the service; their
  // completion is also what clears resettingHardware.
  const [settingsRefreshNonce, setSettingsRefreshNonce] = useState(0);
  const { push: pushToast } = useToastSafe();
  // One-shot flash request forwarded to the preview iframe when an edit is
  // rejected (a resize that can't fit). nonce re-fires repeat rejections.
  const [flashSignal, setFlashSignal] = useState<{ widgetId: string; nonce: number } | null>(null);
  // Per-panel persisted settings off the device record (promoted monitors).
  const [recordReserve, setRecordReserve] = useState(true);
  const [recordAutoOrient, setRecordAutoOrient] = useState(true);
  const [recordTouch, setRecordTouch] = useState<boolean | undefined>(undefined);
  // Curated display family (capabilities.family, e.g. 'xeneon-edge') off the
  // matched record - drives which promoted-monitor-only settings apply.
  const [recordFamily, setRecordFamily] = useState<string | undefined>(undefined);
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
  // Only the curated Xeneon Edge family carries a physical orientation
  // sensor; other promoted monitors keep the manual-only rotation picker.
  const monitorAutoOrient = monitorRotation && recordFamily === 'xeneon-edge';
  // Independent of host rotation support: the Xeneon Edge's native settings
  // tab (brightness/backlight/contrast/RGB) must stay reachable even when
  // this host implements neither DDC nor OS rotation.
  const isXeneonEdgePanel = isMonitorPanel && recordFamily === 'xeneon-edge';
  // The Xeneon Edge's native settings block (msgid 0x0e read, ~1s on the
  // bench) - null hides the whole block until the read completes.
  const [xeneonSettings, setXeneonSettings] = useState<XeneonEdgeSettingsValues | null>(null);
  useEffect(() => {
    if (!isXeneonEdgePanel || !device?.displayId) return;
    let cancelled = false;
    fetchXeneonEdgeSettings(device.displayId).then(settings => {
      if (cancelled || !settings) return;
      setXeneonSettings({
        brightness: settings.brightness ?? XENEON_EDGE_DEFAULTS.brightness,
        backlight: settings.backlight ?? XENEON_EDGE_DEFAULTS.backlight,
        contrast: settings.contrast ?? XENEON_EDGE_DEFAULTS.contrast,
        red: settings.red ?? XENEON_EDGE_DEFAULTS.red,
        green: settings.green ?? XENEON_EDGE_DEFAULTS.green,
        blue: settings.blue ?? XENEON_EDGE_DEFAULTS.blue,
      });
    }).catch(() => {}).finally(() => {
      // A hardware reset holds its busy flag until this ~1s DDC re-read
      // lands, so the sliders can't take a drag on pre-reset values that
      // the refetch is about to stomp.
      setResettingHardware(false);
    });
    return () => { cancelled = true; };
  }, [isXeneonEdgePanel, device?.displayId, settingsRefreshNonce]);
  // Strip panels turned landscape (Y70 682x2560 = 3.75, Xeneon Edge
  // 2560x720 = 3.56) leave the canvas a sliver inside the tall side-by-side
  // preview column, so they stack instead: options above, canvas docked
  // below. Q-series (1.78) and ordinary monitors (16:9 = 1.78, 21:9 = 2.33)
  // stay side-by-side.
  //
  // Both halves of this read the SAME canvas the preview frame renders, so
  // the dock and the canvas flip in one state update. Deriving the landscape
  // test from `orientation` instead splits it across two writers a rotation
  // updates at different times - the auto-orient worker rewrites orientation
  // immediately, while cssWidth/cssHeight only land when
  // DisplayTopologyWatcher's 500ms debounce fires SyncPromotedPanelCapabilities
  // - so the layout would visibly restack half a second before the canvas.
  const STRIP_ASPECT_MIN = 2.5;
  const previewCanvas = liveCanvas ?? device?.previewSize;
  const isStripPanel = !!previewCanvas && previewCanvas.width > 0 && previewCanvas.height > 0
    && Math.max(previewCanvas.width, previewCanvas.height)
       / Math.min(previewCanvas.width, previewCanvas.height) >= STRIP_ASPECT_MIN;
  const dockPreview = isStripPanel && previewCanvas!.width > previewCanvas!.height;
  const settingsAvailable = supportsDisplayControls || supportsAutoLaunch || ddcSupported
    || monitorRotation || monitorReserve
    // The Xeneon Edge's native settings replace DDC brightness for this
    // family, so it must not depend on ddcSupported/monitorRotation.
    || isXeneonEdgePanel
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
  // The widget preview + add-widget catalog render inside the desktop chrome,
  // where --accent is the desktop app's, not this panel's. Inject the panel's
  // accent vars (at the preview's own resolved mode) so previews highlight in
  // the panel's hue instead of the desktop default.
  const panelPreviewThemeStyle = buildPanelThemeVars(theme, desktopResolvedThemeMode);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([
      supportsDisplayControls ? fetchService<BrightnessResponse>('/y70/brightness') : Promise.resolve(null),
      supportsDisplayControls ? fetchService<RotationParams>('/y70/rotation') : Promise.resolve(null),
      supportsDisplayControls ? fetchService<ToggleResponse>('/y70/toggle') : Promise.resolve(null),
      isQSeries ? getQSeriesRotation() : Promise.resolve(null),
      isQSeries ? getQSeriesDisplay() : Promise.resolve(null),
      fetchPreferences(),
      fetchPanelDevices(),
    ]).then(([b, r, tog, qRotation, qDisplay, prefs, devices]) => {
      if (cancelled) return;
      if (b) setBrightness(b.brightness);
      if (r) {
        setOrientation(normalizeOrientation(r.orientation));
        setForceOrientation(r.forceOrientation ?? true);
      }
      if (qRotation) setOrientation(normalizeOrientation(qRotation.orientation));
      if (qDisplay) {
        setQSeriesBrightness(qDisplay.brightness);
        setQSeriesScreenOff(qDisplay.screenOff);
        setQSeriesSleepWithHost(qDisplay.sleepWithHost);
      }
      // /y70/toggle returns the persisted ScreenOff value, not "screen on".
      if (tog) setScreenOn(!tog.toggle);
      // Record-backed entries (promoted monitors) bind by their explicit
      // record id - several records share the 'monitor' surface, so a
      // surface scan would grab whichever was last seen. Everything else
      // (Y70 / Q-series / simulators) keeps the surface match: pick the most
      // recently active record for this surface (/panel/devices is sorted
      // by lastSeenAt desc). Display-bound records are excluded from the
      // surface match: they are per-physical-monitor and only their own row
      // (panelRecordId) may edit them - a simulated monitor otherwise binds a
      // real display's record, PATCHes its layout, and inherits its canvas
      // instead of the preset's.
      const match = device?.panelRecordId
        ? devices?.devices.find(d => d.id === device.panelRecordId)
        : devices?.devices.find(d => d.capabilities?.surface === surface && !d.displayId);
      setEditingDeviceId(match?.id ?? null);
      const cw = match?.capabilities?.cssWidth;
      const ch = match?.capabilities?.cssHeight;
      setLiveCanvas(cw && ch ? { width: cw, height: ch } : null);
      setLiveDpr(match?.capabilities?.dpr ?? null);
      setLiveDpi(match?.capabilities?.dpi ?? null);
      // Per-panel persisted settings (promoted monitors).
      setRecordReserve(match?.reserveMonitor ?? true);
      setRecordAutoOrient(match?.autoOrient ?? true);
      setRecordFamily(match?.capabilities?.family);
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
      // Non-Xeneon panels re-enable the hardware-reset button once these
      // reads land; Xeneon waits for its slower DDC re-read above.
      if (!isXeneonEdgePanel) setResettingHardware(false);
    }).catch(() => { if (!cancelled) { setLoaded(true); setResettingHardware(false); } });
    return () => { cancelled = true; };
  }, [surface, supportsDisplayControls, isQSeries, isXeneonEdgePanel, device?.panelRecordId, device?.capabilities.touch, settingsRefreshNonce]);

  const pushBrightness = (value: number) => {
    setBrightness(value);
    if (!supportsDisplayControls) return;
    postService('/y70/brightness', { brightness: value }).catch(() => {});
  };

  // Live preview only - no HID write. Keeps the slider silky during drag; the
  // write fires once from previewXeneonControl's callers on commit.
  const previewXeneonControl = (key: XeneonEdgeControlKey, value: number) => {
    setXeneonSettings(prev => (prev ? { ...prev, [key]: value } : prev));
  };

  const commitXeneonControl = (key: XeneonEdgeControlKey, value: number) => {
    previewXeneonControl(key, value);
    if (!device?.displayId) return;
    // The response carries what the panel actually applied, which is not
    // always what was asked: the service clamps to the control's range, and a
    // write can fail. Show the panel's value, not the requested one.
    void setXeneonEdgeSettings(device.displayId, xeneonEdgePatchFor(key, value))
      .then(applied => {
        const echoed = applied?.[key];
        if (typeof echoed !== 'number') return;
        setXeneonSettings(prev => (prev ? { ...prev, [key]: echoed } : prev));
      })
      .catch(() => {});
  };

  // Editor capacity must match the runtime grid, or placements the editor
  // allows get clamped on the device (and canvas the device offers stays
  // unreachable here). Promoted monitors derive it from the same capacity
  // math the kiosk runs, on the record's physical canvas (css x dpr) and
  // density; simulated phone presets derive it from the preset canvas via
  // the shared simulator viewport math; the remaining surfaces have fixed
  // per-surface grids.
  const editorCapacity = useMemo(() => {
    if (surface === 'q60') return { gridCols: 2, pageRows: 4 };
    // Row counts on gap-derived surfaces (below) must resolve against the
    // same ratio the live grid renders with, or the editor allows placements
    // the device can't actually fit (or clamps ones it could).
    const paddingRatio = panelWidgetPaddingRatio(normalizePanelWidgetPadding(theme.widgetPadding));
    const monitorCanvas = surface === 'monitor' ? (liveCanvas ?? device?.previewSize) : undefined;
    if (surface === 'monitor' && monitorCanvas) {
      // Physical px = canvas x dpr. liveCanvas and a real record's
      // previewSize are CSS px (scaled by the record dpr); a simulated
      // preset's previewSize is native px with no previewDpr (dpr 1).
      const dpr = (liveCanvas ? liveDpr : device?.previewDpr) || 1;
      const capacity = panelGridCapacityForCanvas(
        Math.max(1, Math.round(monitorCanvas.width * dpr)),
        Math.max(1, Math.round(monitorCanvas.height * dpr)),
        {
          surface,
          dpi: liveDpi ?? device?.previewDpi ?? DEFAULT_SURFACE_DPI.monitor,
          // The kiosk's readRuntimePanelGrid honors the dev sizing knob;
          // omitting it here diverges the editor grid whenever it is set.
          sizing: getPanelGridSizingSettings(),
          paddingRatio,
        },
      );
      return { gridCols: capacity.columns, pageRows: capacity.rows };
    }
    if (surface === 'monitor') return { gridCols: 8, pageRows: 6 };
    if (surface === 'y70') {
      // The runtime transposes the fixed Y70 grid in landscape (grid.ts
      // y70Landscape); conforming against the portrait grid there would fight
      // the kiosk's own repagination. Canvas facts arrive via the kiosk's
      // capability report; run them through the same capacity math the kiosk
      // does (density + sizing knob included) so the counts cannot diverge.
      // Without canvas facts assume portrait (the forced default).
      const y70Canvas = liveCanvas ?? device?.previewSize;
      if (y70Canvas) {
        const dpr = (liveCanvas ? liveDpr : device?.previewDpr) || 1;
        const capacity = panelGridCapacityForCanvas(
          Math.max(1, Math.round(y70Canvas.width * dpr)),
          Math.max(1, Math.round(y70Canvas.height * dpr)),
          {
            surface,
            dpi: liveDpi ?? device?.previewDpi ?? DEFAULT_SURFACE_DPI.y70,
            sizing: getPanelGridSizingSettings(),
            paddingRatio,
          },
        );
        return { gridCols: capacity.columns, pageRows: capacity.rows };
      }
      return { gridCols: PANEL_GRID_COLS, pageRows: PANEL_Y70_LONG_AXIS_CELLS };
    }
    // Phone-surface rows here are simulated presets only (real phones are
    // self-managed and never open this editor), so the preset's native canvas
    // + density derive the true runtime grid - shared CSS-space math with the
    // simulator iframe. Without preset facts, fall back to the fixed phone
    // grid.
    if (surface === 'phone' && device?.previewSize && device?.previewDpi) {
      return simulatedPanelEditorCapacity(
        surface,
        device.previewSize.width,
        device.previewSize.height,
        device.previewDpi,
        paddingRatio,
      );
    }
    return { gridCols: 4, pageRows: 16 };
  }, [surface, liveCanvas, liveDpr, liveDpi, device?.previewSize, device?.previewDpi, device?.previewDpr, theme.widgetPadding]);

  // True when editorCapacity reflects the device's real grid rather than a
  // fallback guess. q60/y70 fixed grids ARE the runtime grid; monitor is
  // derived whenever canvas facts exist; phone-sim derives from preset facts
  // and its 4x16 fallback matches the runtime's fixed phone editor default.
  // Only the monitor 8x6 fallback (record with no canvas facts) is a guess -
  // geometry must never be conformed against it, or an edit repacks and
  // persists placements of widgets the user never touched at a capacity the
  // device may not have.
  const editorCapacityDerived = surface !== 'monitor' || !!(liveCanvas ?? device?.previewSize);

  // Conform editor state to the editor grid whenever the layout or the
  // capacity resolves (initial record load, reverse sync, a late-arriving
  // liveCanvas). Loop-safe: repaginatePanelLayout returns the same reference
  // when nothing changes. Render-only until the next user edit persists -
  // opening the editor must not write to the device record.
  useEffect(() => {
    if (!editorCapacityDerived) return;
    const conformed = repaginatePanelLayout(layout, editorCapacity);
    if (conformed !== layout) setLayout(conformed);
  }, [layout, editorCapacity, editorCapacityDerived]);

  const updateLayout = useCallback((next: PanelLayout) => {
    // Normalize is geometry-neutral (registry reconcile + size snap only), so
    // conform the geometry to the editor grid before persisting - the stored
    // bytes must be a fixed point of the capacity repair or the preview and
    // the persisted placement diverge. Skipped while the capacity is a
    // fallback guess; the un-conformed persist self-heals when the device
    // next renders and auto-persists its repagination.
    const normalized = editorCapacityDerived
      ? repaginatePanelLayout(normalizePanelLayout(next, surface, deviceTouch), editorCapacity)
      : normalizePanelLayout(next, surface, deviceTouch);
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
  }, [editingDeviceId, surface, deviceTouch, editorCapacity, editorCapacityDerived]);

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
      setLiveDpi(record.capabilities?.dpi ?? null);
      // A physical rotation (Xeneon Edge auto-orient) rewrites the record's
      // orientation and broadcasts here. Without this the page keeps its
      // mount-time value, so the rotation picker and the landscape preview
      // dock never track a panel the user turns in their hands.
      if (record.capabilities?.orientation) setOrientation(normalizeOrientation(record.capabilities.orientation));
      setLayout(normalizePanelLayout(record.layout ?? defaultLayoutForSurface(surface), surface, deviceTouch));
    }).catch(() => {});
  });

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
      // swapSingleWidget preserves each type's config on the layout, so
      // switching widgets restores prior settings (persisted like multi-widget
      // panels' configs, not reset on every swap).
      const next: PanelWidget = { id: createUuid(), type, size, col: 0, row: 0 };
      updateLayout(swapSingleWidget(layout, next));
      return;
    }
    const next: PanelWidget = {
      id: createUuid(),
      type,
      size,
      col: 0,
      row: 0,
    };
    // Prefer the page the preview is showing; appendWidget falls back to
    // the first page with room.
    const appended = appendWidget(layout, next, editorCapacity, {
      preferredPageId: layout.activePageId,
    });
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
    // same engine op the on-device runtime uses. An in-place grow on a full
    // page over-fills it, and over-capacity pages render clamped with widgets
    // stacked - so a grow MUST paginate, never overflow a page in place.
    // null = the size can't fit anywhere; reject it.
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

  // Captures the preview iframe at the device's physical resolution, so the
  // saved image matches the glass pixel-for-pixel in the current orientation.
  const takeScreenshot = useCallback(async () => {
    const frame = embedFrameRef.current;
    if (!frame) {
      pushToast({ title: t('devices.panels.screenshotError') });
      return;
    }
    setScreenshotBusy(true);
    try {
      const native = resolvePanelNativeCanvas({
        surface,
        liveCanvas,
        liveDpr,
        previewSize: device?.previewSize,
        previewDpr: device?.previewDpr,
      });
      const blob = await frame.capture({ width: native.nativeWidth, height: native.nativeHeight });
      const now = new Date();
      const pad = (v: number) => String(v).padStart(2, '0');
      const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const name = `${sanitizeFileName(device?.name ?? t('devices.y70.title'))}-${stamp}.png`;
      await saveBlobToFile(blob, name, [
        { description: t('devices.panels.screenshotPngType'), accept: { 'image/png': ['.png'] } },
      ]);
    } catch (err) {
      console.error('[panel-screenshot] capture failed', err);
      pushToast({ title: t('devices.panels.screenshotError') });
    } finally {
      setScreenshotBusy(false);
    }
  }, [surface, liveCanvas, liveDpr, device?.previewSize, device?.previewDpr, device?.name, pushToast, t]);

  // Personalization reset: the service clears the record's layout / theme /
  // widget state and deletes its uploaded media; the panel/device broadcast
  // refetches the layout and theme everywhere (the media library list
  // refetches on its next mount).
  const resetPersonalization = useCallback(async () => {
    if (!editingDeviceId) return;
    setResetPersonalizationConfirmOpen(false);
    setResettingPersonalization(true);
    try {
      await resetPanelDevice(editingDeviceId);
      broadcastLayoutChanged();
      pushToast({ title: t('devices.panels.resetPersonalization.done') });
    } catch {
      pushToast({ title: t('devices.panels.resetPersonalization.error') });
    } finally {
      setResettingPersonalization(false);
    }
  }, [editingDeviceId, pushToast, t]);

  // Hardware-settings reset: the service restores the Settings-tab defaults
  // and applies them to the hardware (brightness/orientation/screen, Xeneon
  // DDC picture values, monitor behavior). The broadcast lets the kiosk pick
  // up the change; THIS page re-reads via the nonce, and the busy flag stays
  // up until those re-reads land (the settings effects clear it) so no
  // control takes input on pre-reset values.
  const resetHardware = useCallback(async () => {
    if (!editingDeviceId) return;
    setResetHardwareConfirmOpen(false);
    setResettingHardware(true);
    try {
      await resetPanelDeviceHardware(editingDeviceId);
      broadcastLayoutChanged();
      setSettingsRefreshNonce(n => n + 1);
      pushToast({ title: t('devices.panels.resetHardware.done') });
    } catch {
      pushToast({ title: t('devices.panels.resetHardware.error') });
      setResettingHardware(false);
    }
  }, [editingDeviceId, pushToast, t]);

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
  // The firmware route emits the qseries-app item whenever the panel is
  // reachable over adb; currentVersion === '' means reachable with qshell not
  // installed (the install gate case). No item at all means the panel's USB
  // is not attached - that is a disconnected panel, not a missing app.
  const panelAppItem = firmwareItems.find(item => item.deviceType === 'qseries-app');
  const panelReachable = !!panelAppItem;
  const panelAppInstalled = !!panelAppItem && panelAppItem.currentVersion !== '';
  const fwGateReady = loaded && (!isQSeries || firmwareLoaded);
  const showFwGate = isQSeries && !isSimulated && fwGateReady && panelReachable && !panelAppInstalled;
  const showDisconnected = isQSeries && !isSimulated && fwGateReady && !panelReachable;

  return (
    <section className={styles.page}>
      <ViewHeader
        title={pageTitle}
        tabs={showFwGate || showDisconnected ? undefined : tabs}
        activeTab={activeTab}
        onTabChange={(k) => { setConfiguringWidget(null); setTab(k as Tab); }}
        tabActions={
          <Button
            size="sm"
            tone="ghost"
            icon={<Camera size={14} />}
            title={t('devices.panels.screenshot')}
            aria-label={t('devices.panels.screenshot')}
            loading={screenshotBusy}
            onClick={() => { void takeScreenshot(); }}
          />
        }
      />
      <div className={`${styles.pageBody} pageBody`}>
      {!fwGateReady ? (
        <div style={{ color: 'var(--text-dim)', padding: 20 }}>{t('devices.loading')}</div>
      ) : showDisconnected ? (
        <EmptyState
          icon={<Unplug size={48} />}
          title={t('devices.qseries.disconnected.title')}
          hint={t('devices.qseries.disconnected.hint')}
        />
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
        <div className={styles.splitLayout} data-layout={dockPreview ? 'stacked' : 'columns'}>
          {/* Options pane on the left; live preview on the right. Landscape
              strip panels stack instead: options above, canvas docked below. */}
          <div className={styles.leftPane}>
            {configuringWidget ? (
              <InlineWidgetSettings
                key={configuringWidget.id}
                widget={configuringWidget}
                surface={surface}
                deviceTouch={deviceTouch}
                themeMode={desktopResolvedThemeMode}
                themeStyle={panelPreviewThemeStyle}
                onBack={() => setConfiguringWidget(null)}
                onUpdate={handleUpdateWidgetConfig}
                onResize={handleResizeWidget}
                onRemove={(id) => { handleRemoveWidget(id); setConfiguringWidget(null); }}
                onSectionNavigate={onSectionNavigate}
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
                      themeMode={desktopResolvedThemeMode}
                      themeStyle={panelPreviewThemeStyle}
                    />
                  )}
                  {activeTab === 'theme' && (() => {
                    // Aspect from live CSS viewport (DPR cancels); bake target =
                    // the device's physical resolution. Shared with the
                    // screenshot export above.
                    const native = resolvePanelNativeCanvas({
                      surface,
                      liveCanvas,
                      liveDpr,
                      previewSize: device?.previewSize,
                      previewDpr: device?.previewDpr,
                    });
                    const devAspect = native.cssWidth / native.cssHeight;
                    const nativeW = native.nativeWidth;
                    const nativeH = native.nativeHeight;
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
                        onBackdropCommit={panelTheme.commitBackdrop}
                        showBackdropSelector={supportsDesktopWallpaper(surface, !!device?.displayId)}
                        onBackgroundEffectCommit={panelTheme.commitBackgroundEffect}
                        onBackgroundTemplateCommit={panelTheme.commitBackgroundTemplate}
                        onBackgroundEffectStatePreview={panelTheme.previewBackgroundEffectState}
                        onBackgroundEffectStateCommit={panelTheme.commitBackgroundEffectState}
                        onBackgroundOpacityPreview={panelTheme.previewBackgroundOpacity}
                        onBackgroundOpacityCommit={panelTheme.commitBackgroundOpacity}
                        onBackgroundMediaCommit={panelTheme.commitBackgroundMedia}
                        onBackgroundFrostPreview={panelTheme.previewBackgroundFrost}
                        onBackgroundFrostCommit={panelTheme.commitBackgroundFrost}
                        onWidgetOpacityPreview={panelTheme.previewWidgetOpacity}
                        onWidgetOpacityCommit={panelTheme.commitWidgetOpacity}
                        onWidgetLabelsCommit={panelTheme.commitWidgetLabels}
                        onWidgetPaddingPreview={panelTheme.previewWidgetPadding}
                        onWidgetPaddingCommit={panelTheme.commitWidgetPadding}
                        showMediaTab={surface !== 'desktop'}
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
                      screenOff={null}
                      onScreenOffToggle={() => {}}
                      sleepWithHost={null}
                      onSleepWithHostToggle={() => {}}
                      autoOrient={monitorAutoOrient ? recordAutoOrient : null}
                      onAutoOrientToggle={() => {
                        const next = !recordAutoOrient;
                        setRecordAutoOrient(next);
                        if (device?.panelRecordId) void patchPanelDevice(device.panelRecordId, { autoOrient: next }).catch(() => {});
                      }}
                      reserveMonitor={monitorReserve ? recordReserve : null}
                      onReserveMonitorToggle={() => {
                        const next = !recordReserve;
                        setRecordReserve(next);
                        if (device?.panelRecordId) void patchPanelDevice(device.panelRecordId, { reserveMonitor: next }).catch(() => {});
                      }}
                      xeneonSettings={isXeneonEdgePanel ? xeneonSettings : null}
                      onXeneonChange={previewXeneonControl}
                      onXeneonCommit={commitXeneonControl}
                      hardwareResetBusy={resettingHardware}
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
                      // The handler reports the plain id until the serial
                      // controller identifies the variant; showing that
                      // fallback would read as an identified base model.
                      variant={device?.firmwareType !== device?.sourceId ? device?.firmwareType : undefined}
                    />
                  )}
                  {activeTab === 'settings' && surface === 'q60' && (
                    <div className={styles.settingsContent}>
                      <MonitorSettingsPanel
                        brightness={qSeriesBrightness}
                        onBrightness={(value) => {
                          setQSeriesBrightness(value);
                          void setQSeriesDisplay({ brightness: value }).catch(() => {});
                        }}
                        orientation={orientation}
                        onOrientation={(next) => {
                          setOrientation(next);
                          void setQSeriesRotation(next as QSeriesOrientation).catch(() => {});
                        }}
                        orientationOptions={QSERIES_ORIENTATIONS}
                        screenOff={qSeriesScreenOff}
                        onScreenOffToggle={() => {
                          const next = !qSeriesScreenOff;
                          setQSeriesScreenOff(next);
                          void setQSeriesDisplay({ screenOff: next }).catch(() => {});
                        }}
                        sleepWithHost={qSeriesSleepWithHost}
                        onSleepWithHostToggle={() => {
                          const next = !qSeriesSleepWithHost;
                          setQSeriesSleepWithHost(next);
                          void setQSeriesDisplay({ sleepWithHost: next }).catch(() => {});
                        }}
                        reserveMonitor={null}
                        onReserveMonitorToggle={() => {}}
                        // Q-series has no orientation sensor and no vendor
                        // settings channel: null hides both blocks, leaving the
                        // manual picker unconditional.
                        autoOrient={null}
                        onAutoOrientToggle={() => {}}
                        xeneonSettings={null}
                        onXeneonChange={() => {}}
                        onXeneonCommit={() => {}}
                        hardwareResetBusy={resettingHardware}
                      />
                      <QSeriesCoolerSettings />
                    </div>
                  )}
                  {/* Panel devices with a settings tab (Y70 / Q-series /
                      promoted monitors) get the two per-device resets below
                      the surface-specific settings: personalization (the
                      Widgets + Theme tabs) and hardware settings (this tab). */}
                  {activeTab === 'settings' && editingDeviceId && (
                    <div className={`${styles.settingsContent} ${styles.settingsContentDanger}`}>
                      {/* eslint-disable-next-line i18next/no-literal-string -- CSS variable token */}
                      <SettingsSection title={t('settings.dangerZone')} titleStyle={{ color: 'var(--bad)' }}>
                        <SettingRow
                          label={t('devices.panels.resetPersonalization.label')}
                          description={t('devices.panels.resetPersonalization.description')}
                        >
                          <Button
                            type="button"
                            tone="danger"
                            size="sm"
                            onClick={() => setResetPersonalizationConfirmOpen(true)}
                            disabled={resettingPersonalization}
                          >
                            {t('devices.panels.resetPersonalization.button')}
                          </Button>
                        </SettingRow>
                        <SettingRow
                          label={t('devices.panels.resetHardware.label')}
                          description={t('devices.panels.resetHardware.description')}
                        >
                          <Button
                            type="button"
                            tone="danger"
                            size="sm"
                            onClick={() => setResetHardwareConfirmOpen(true)}
                            disabled={resettingHardware}
                          >
                            {t('devices.panels.resetHardware.button')}
                          </Button>
                        </SettingRow>
                      </SettingsSection>
                    </div>
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
                captureRef={embedFrameRef}
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
                // Hosted-monitor previewSize is CSS px (record cssWidth/
                // cssHeight), so it must skip the native->CSS /DPR even before
                // the record fetch fills liveCanvas.
                canvasIsCssPixels={!!liveCanvas || isMonitorPanel}
                gridDpi={liveCanvas && liveDpi
                  ? liveDpi / (liveDpr && liveDpr > 0 ? liveDpr : 1)
                  : (surface === 'monitor' && device?.previewDpi
                    ? device.previewDpi / (device.previewDpr || 1)
                    : undefined)}
                brightness={supportsDisplayControls ? brightness : 100}
                screenOn={supportsDisplayControls ? screenOn : true}
                showPanel={supportsAutoLaunch ? autoLaunch : true}
                deviceId={editingDeviceId ?? undefined}
                deviceTouch={deviceTouch}
                displayBound={!!device?.displayId}
              />
            </div>
          </div>
        </div>
      )}
      </div>
      <ConfirmModal
        open={resetPersonalizationConfirmOpen}
        title={t('devices.panels.resetPersonalization.confirmTitle')}
        message={t('devices.panels.resetPersonalization.confirmMessage')}
        bullets={t('devices.panels.resetPersonalization.wipeList').split('\n')}
        note={t('settings.factoryReset.confirmNote')}
        // eslint-disable-next-line i18next/no-literal-string -- note tone enum value
        noteTone="danger"
        confirmLabel={t('devices.panels.resetPersonalization.confirmButton')}
        destructive
        onConfirm={() => void resetPersonalization()}
        onCancel={() => setResetPersonalizationConfirmOpen(false)}
      />
      <ConfirmModal
        open={resetHardwareConfirmOpen}
        title={t('devices.panels.resetHardware.confirmTitle')}
        message={t('devices.panels.resetHardware.confirmMessage')}
        bullets={t('devices.panels.resetHardware.wipeList').split('\n')}
        note={t('devices.panels.resetHardware.confirmNote')}
        confirmLabel={t('devices.panels.resetHardware.confirmButton')}
        destructive
        onConfirm={() => void resetHardware()}
        onCancel={() => setResetHardwareConfirmOpen(false)}
      />
    </section>
  );
}

// --- Inline Widget Settings (replaces left pane when editing a widget) ---

interface InlineWidgetSettingsProps {
  widget: PanelWidget;
  surface: PanelSurface;
  deviceTouch?: boolean;
  themeMode?: 'dark' | 'light';
  // Panel accent vars injected onto the preview root so the widget preview
  // highlights in the panel's accent, not the desktop chrome's.
  themeStyle?: CSSProperties;
  onBack: () => void;
  onUpdate: (widgetId: string, config: Record<string, PanelConfigValue>) => void;
  onResize: (widgetId: string, size: PanelWidgetSize) => void;
  onRemove: (widgetId: string) => void;
  onSectionNavigate?: (section: string) => void;
}

function InlineWidgetSettings({ widget, surface, deviceTouch, themeMode = 'dark', themeStyle, onBack, onUpdate, onResize, onRemove, onSectionNavigate }: InlineWidgetSettingsProps) {
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
  const [deckEditView, setDeckEditView] = useState<DeckEditView>({ page: 0, folderPath: [] });

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
              style={{ ...themeStyle, width: previewW, height: previewH }}
            >
              <div className={`panel-card ${styles.inlineSettingsPreviewCard}`}>
                <ErrorBoundary label={widget.type}>
                  <Comp
                    widget={widget}
                    // The preview mirrors the target surface's interactivity.
                    surface={surface}
                    deviceTouch={deviceTouch}
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
            onSectionNavigate={onSectionNavigate}
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

// --- Orientation select row ---
//
// Shared by the Y70, monitor, and Q-series display settings panels below;
// only the option list and the commit handler differ per surface.

interface OrientationSelectRowProps {
  value: Y70Orientation;
  onChange: (value: Y70Orientation) => void;
  options: readonly Y70Orientation[];
}

function OrientationSelectRow({ value, onChange, options }: OrientationSelectRowProps) {
  const { t } = useTranslation();
  return (
    <SettingSelect
      label={t('devices.y70.orientation')}
      value={value}
      onChange={(v) => onChange(v as Y70Orientation)}
      options={options.map(o => ({
        value: o,
        label: t(`devices.y70.orientation.${o}`),
      }))}
    />
  );
}

// --- Monitor (promoted display) settings ---
//
// Per-panel persisted settings for display-bound panels: DDC/CI brightness
// (when the monitor exposes it), OS rotation, and the per-record
// "keep panel clear of other windows" reserve. Null props hide a row - also
// reused for the Q-series hub, which only ever supplies orientation.

interface MonitorSettingsPanelProps {
  brightness: number | null;
  onBrightness: (v: number) => void;
  orientation: Y70Orientation | null;
  onOrientation: (v: Y70Orientation) => void;
  orientationOptions: readonly Y70Orientation[];
  screenOff: boolean | null;
  onScreenOffToggle: () => void;
  sleepWithHost: boolean | null;
  onSleepWithHostToggle: () => void;
  // Null hides the row (no orientation sensor on this panel family).
  autoOrient: boolean | null;
  onAutoOrientToggle: () => void;
  reserveMonitor: boolean | null;
  onReserveMonitorToggle: () => void;
  // Corsair Xeneon Edge native settings (brightness/backlight/contrast/RGB).
  // Null hides the whole block: not this panel family, or the ~1s HID read
  // hasn't resolved yet.
  xeneonSettings: XeneonEdgeSettingsValues | null;
  // Live preview during drag - no HID write.
  onXeneonChange: (key: XeneonEdgeControlKey, value: number) => void;
  // Fires the HID write; called once per drag gesture or typed edit.
  onXeneonCommit: (key: XeneonEdgeControlKey, value: number) => void;
  // True while the danger-zone hardware reset is rewriting the controls.
  hardwareResetBusy: boolean;
}

function MonitorSettingsPanel({
  brightness, onBrightness,
  orientation, onOrientation, orientationOptions,
  screenOff, onScreenOffToggle,
  sleepWithHost, onSleepWithHostToggle,
  autoOrient, onAutoOrientToggle,
  reserveMonitor, onReserveMonitorToggle,
  xeneonSettings, onXeneonChange, onXeneonCommit,
  hardwareResetBusy,
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
      {xeneonSettings !== null && XENEON_EDGE_CONTROLS.map(({ key, labelKey, min, max }) => (
        <SettingSlider
          key={key}
          editable
          trackFill
          label={t(labelKey)}
          value={xeneonSettings[key]}
          min={min}
          max={max}
          // A hardware reset is a serialized HID round-trip per control (no
          // server-side coalescing) and rewrites all six, so block a
          // concurrent drag on any field it is about to overwrite.
          disabled={hardwareResetBusy}
          onChange={(value, commit) => {
            onXeneonChange(key, value);
            if (commit) onXeneonCommit(key, value);
          }}
          onCommit={(value) => onXeneonCommit(key, value)}
        />
      ))}
      {autoOrient !== null && (
        <SettingToggle
          label={t('devices.xeneonEdge.autoOrient')}
          description={t('devices.xeneonEdge.autoOrientHint')}
          checked={autoOrient}
          onChange={onAutoOrientToggle}
        />
      )}
      {/* Auto-orient on means the sensor owns the orientation, so the manual
          picker only shows when it is off. Null autoOrient = a panel family
          with no sensor, which keeps the picker unconditionally. */}
      {orientation !== null && (autoOrient === null || !autoOrient) && (
        <OrientationSelectRow value={orientation} onChange={onOrientation} options={orientationOptions} />
      )}
      {screenOff !== null && (
        <SettingToggle
          label={t('devices.qseries.screen')}
          checked={!screenOff}
          onChange={onScreenOffToggle}
        />
      )}
      {sleepWithHost !== null && (
        <SettingToggle
          label={t('devices.qseries.sleepWithHost')}
          checked={sleepWithHost}
          onChange={onSleepWithHostToggle}
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
  // Firmware-catalog variant key (e.g. "y70-truly") for support diagnosis.
  variant?: string;
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
  variant,
}: SettingsPanelProps) {
  const { t } = useTranslation();
  const { push } = useToast();
  const [touchRepairBusy, setTouchRepairBusy] = useState(false);
  const [touchWizardConfirmOpen, setTouchWizardConfirmOpen] = useState(false);

  const handleRepairTouchMapping = useCallback(async () => {
    setTouchRepairBusy(true);
    try {
      const result = await repairTouchMapping();
      const status = result?.status ?? 'failed';
      if (status === 'repaired') {
        push({ title: t('devices.y70.touchRepair.repaired') });
        return;
      }
      if (status === 'alreadyCorrect') {
        push({ title: t('devices.y70.touchRepair.alreadyCorrect') });
        return;
      }
      const errorStatus = toTouchRepairErrorStatus(status);
      push({ title: t(`devices.y70.touchRepair.error.${errorStatus}`) });
      if (errorStatus === 'failed') setTouchWizardConfirmOpen(true);
    } finally {
      setTouchRepairBusy(false);
    }
  }, [push, t]);

  const handleLaunchTouchWizard = useCallback(async () => {
    setTouchWizardConfirmOpen(false);
    let launched = false;
    try {
      launched = await launchTouchSetupWizard();
    } finally {
      push({ title: t(launched ? 'devices.y70.touchRepair.wizardLaunched' : 'devices.y70.touchRepair.wizardLaunchFailed') });
    }
  }, [push, t]);

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
            <OrientationSelectRow value={orientation} onChange={onOrientation} options={orientationOptions} />
          )}

          <SettingRow
            label={t('devices.y70.touchRepair')}
            description={t('devices.y70.touchRepairHint')}
          >
            <Button
              type="button"
              tone="neutral"
              size="sm"
              loading={touchRepairBusy}
              disabled={usbDisconnected}
              onClick={() => void handleRepairTouchMapping()}
            >
              {t('devices.y70.touchRepairButton')}
            </Button>
          </SettingRow>

          {!!variant && (
            <SettingRow label={t('devices.y70.variant')}>
              <span className={styles.variantValue}>{variant}</span>
            </SettingRow>
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

      <ConfirmModal
        open={touchWizardConfirmOpen}
        title={t('devices.y70.touchRepair.wizardConfirmTitle')}
        message={t('devices.y70.touchRepair.wizardConfirmMessage')}
        confirmLabel={t('devices.y70.touchRepair.wizardConfirmButton')}
        destructive={false}
        onConfirm={() => void handleLaunchTouchWizard()}
        onCancel={() => setTouchWizardConfirmOpen(false)}
      />
    </div>
  );
}
