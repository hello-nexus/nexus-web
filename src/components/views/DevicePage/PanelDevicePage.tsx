import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowLeft, Trash2, LayoutGrid, Palette, Settings, Download, AlertTriangle, Unplug, Camera, Wallpaper } from 'lucide-react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SIZE_ICONS } from '../../../panel/widgets/common/SizeIcons';
import { WidgetControlGroup } from '../../../panel/widgets/common/WidgetControlGroup';
import { PanelGaugeGradientProvider, type PanelGaugeGradientValue } from '../../../panel/widgets/common/PanelGaugeGradientContext';
import { slotLayoutOptionsForSize, resolvedSlotCountForSize, resolvedSlotLayout, slotLayoutKey, type SlotLayout } from '../../../panel/widgets/monitoring/perfSlots';
import { SlotLayoutIcon } from '../../../panel/widgets/monitoring/SlotCountIcons';
import {
  appendWidget,
  patchWidgetById,
  removeWidgetById,
  swapSingleWidget,
  tryResizeWidget,
} from '../../../panel/engine/panelLayoutOps';
import { findWidgetById } from '../../../panel/engine/panelLayoutHelpers';
import { DEFAULT_SURFACE_DPI, MAX_PANEL_PAGES } from '../../../panel/engine/panelGrid';
import {
  panelGridCapacityForCanvas,
  panelWidgetPaddingRatio,
  PANEL_GRID_COLS,
  PANEL_Y70_LONG_AXIS_CELLS,
} from '../../../panel/engine/grid';
import { normalizePanelWidgetPadding } from '../../../panel/background/panelBackground';
import { normalizePanelLayout } from '../../../panel/engine/usePanelLayout';
import { useAppsChangedSync } from '../../../panel/engine/useAppsChangedSync';
import { useMarketplaceRegistryRefresh } from '../../../panel/engine/useMarketplaceRegistryRefresh';
import { repaginatePanelLayout } from '../../../panel/engine/paginate';
import { simulatedPanelEditorCapacity } from '../../../panel/embed/simulatedPanelViewport';
import { getPanelGridSizingSettings } from '../../../lib/panelSimulation';
import {
  canMarkImmersiveOnLoad,
  isImmersiveOnLoadWidget,
  setImmersiveOnLoadWidgetId,
} from '../../../panel/engine/immersiveOnLoad';
import { isSingleWidgetSurface, singleWidgetSurfaceSize, surfaceSupportsMountOrientation } from '../../../panel/types';
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
  factoryResetPanelDevice,
  type PanelDeviceRecord,
} from '../../../api/panel';
import {
  getQSeriesRotation,
  setQSeriesRotation,
  getQSeriesDisplay,
  setQSeriesDisplay,
  rebootQSeriesPanel,
  getQSeriesLinkState,
  repairQSeriesLink,
  type QSeriesOrientation,
  type QSeriesLinkState,
} from '../../../api/qseries';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import { useFlashStatus } from '../../../hooks/useFlashStatus';
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
import { KrakenCoolerSettings } from './KrakenCoolerSettings';
import { CorsairLcdSettings } from './CorsairLcdSettings';
import { useFirmwareStatus } from '../../../hooks/useFirmwareStatus';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { Button } from '../../common/Button/Button';
import { PanelArrowButton } from '../../../panel/chrome/PanelArrowButton';
import { broadcastLayoutChanged } from '../../../panel/engine/panelSync';
import { usePanelRecord } from '../../../panel/engine/usePanelRecord';
import { buildPanelThemeVars, panelAccentColor, usePanelTheme, useResolvedPanelThemeMode } from '../../../panel/theme/panelTheme';
import { resolveGaugeGradient } from '../../../panel/theme/gaugeGradient';
import { PanelThemeSettings } from '../../../panel/editor/PanelThemeSettings';
import { lookupApp, sizesForSurface } from '../../../panel/widgets/registry';
import type { DeckEditView } from '../../../panel/widgets/types';
import { sizeToSpan } from '../../../panel/engine/grid';
import { useDeckInstance, DeckInstanceProvider } from '../../../panel/widgets/deck/useDeckInstance';
import { innerGridForSize } from '../../../panel/widgets/deck/deckLayout';
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

// Bounds the wait for a rebooted panel to re-register. The cold qshell
// bootstrap runs ~2 min over USB-FFS; this only fires when the panel is not
// coming back at all (a wedged USB gadget needs a physical replug).
const REBOOT_COMPLETION_TIMEOUT_MS = 300_000;

// Q60/Q80 mount portrait or portrait-flipped only; no landscape orientation exists.
const QSERIES_ORIENTATIONS: readonly Y70Orientation[] = ['Portrait', 'PortraitFlipped'];

// While the disconnected empty state is showing, re-poll the USB/adb link so
// the page can tell apart "unplugged", "enumerated but adb wedged", and
// "Windows deferred the USB reset" without a full reload.
const QSERIES_LINK_POLL_INTERVAL_MS = 5_000;
// After a manual repair, poll faster and give up once the recovery pass has
// had a realistic chance to bring adb back.
const QSERIES_LINK_REPAIR_POLL_INTERVAL_MS = 3_000;
const QSERIES_LINK_REPAIR_POLL_TIMEOUT_MS = 60_000;

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

type Tab = 'widgets' | 'theme' | 'background' | 'settings';

type XeneonEdgeControlKey = 'brightness' | 'backlight' | 'contrast' | 'red' | 'green' | 'blue';

interface XeneonEdgeSettingsValues {
  brightness: number;
  backlight: number;
  contrast: number;
  red: number;
  green: number;
  blue: number;
}

// Backlight a dimmable cooler LCD runs at until the user moves the slider.
// Matches LianLiAioHandshake.DefaultBrightness in nexus-service.
const DEFAULT_LCD_BRIGHTNESS = 100;

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

// Record-backed entries (promoted monitors) bind by their explicit record id:
// several records share the 'monitor' surface, so a surface scan would grab
// whichever was last seen. Everything else (Y70 / Q-series / simulators) takes
// the most recently active record for its surface (/panel/devices is sorted by
// lastSeenAt desc). Display-bound records are excluded from the surface match:
// they are per-physical-monitor and only their own row (panelRecordId) may edit
// them - a simulated monitor otherwise binds a real display's record, PATCHes
// its layout, and inherits its canvas instead of the preset's.
function matchPanelRecord(
  records: PanelDeviceRecord[] | undefined,
  panelRecordId: string | undefined,
  surface: PanelSurface,
): PanelDeviceRecord | undefined {
  return panelRecordId
    ? records?.find(d => d.id === panelRecordId)
    : records?.find(d => d.capabilities?.surface === surface && !d.displayId);
}

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
  const [qSeriesSleepWhenLocked, setQSeriesSleepWhenLocked] = useState(true);
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
  const [configuringWidgetId, setConfiguringWidgetId] = useState<string | null>(null);
  // Derived, never snapshotted: the on-device panel writes its own edits back
  // through the panel/device reverse sync below, so a copy of the widget goes
  // stale the moment its size or config changes anywhere but here. Resolving
  // to null when the id no longer exists also closes the pane when the widget
  // is removed on the device.
  const configuringWidget = configuringWidgetId ? findWidgetById(layout, configuringWidgetId) ?? null : null;
  // Types already on this panel, across pages, for the single-instance gate.
  const placedTypes = useMemo(
    () => [...new Set(layout.pages.flatMap(p => p.widgets.map(w => w.type)))],
    [layout],
  );
  // Our own PATCHes echo back as panel/device broadcasts, and the reverse
  // sync below refetches on them. Applying that echo would revert a
  // controlled input to the value its round trip started with - the
  // monitoring label field and the deck URL field write per keystroke, so a
  // character typed inside the window would be lost.
  const pendingWritesRef = useRef(0);
  const writeSeqRef = useRef(0);
  // A broadcast skipped during a local write is DEFERRED, not dropped: the
  // service broadcasts before the PATCH response returns, so our own echo is
  // skipped too and no later frame would arrive to trigger a catch-up. A
  // genuine device edit inside the window would be lost until some unrelated
  // broadcast - the very bug this page is being fixed for.
  const missedBroadcastRef = useRef(false);
  // The first edit on a record-less surface allocates; the service broadcasts
  // that record before the POST returns. The unbound topic branch must not
  // bind from the broadcast, or a second edit persists ahead of the first.
  const allocatingRef = useRef(false);
  const embedFrameRef = useRef<PanelEmbedFrameHandle | null>(null);
  const [screenshotBusy, setScreenshotBusy] = useState(false);
  const [resetPersonalizationConfirmOpen, setResetPersonalizationConfirmOpen] = useState(false);
  const [resettingPersonalization, setResettingPersonalization] = useState(false);
  const [resetHardwareConfirmOpen, setResetHardwareConfirmOpen] = useState(false);
  const [resettingHardware, setResettingHardware] = useState(false);
  const [rebootPanelConfirmOpen, setRebootPanelConfirmOpen] = useState(false);
  const [rebootingPanel, setRebootingPanel] = useState(false);
  // Epoch of the in-flight reboot request; null when none. Compared against the
  // record's lastSeenAt to decide the panel is back.
  const rebootRequestedAtRef = useRef<number | null>(null);
  const [factoryResetConfirmOpen, setFactoryResetConfirmOpen] = useState(false);
  const [factoryResettingPanel, setFactoryResettingPanel] = useState(false);
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
  const [recordFlip180, setRecordFlip180] = useState(false);
  const [recordMirror, setRecordMirror] = useState(false);
  const [recordLcdBrightness, setRecordLcdBrightness] = useState(DEFAULT_LCD_BRIGHTNESS);
  const [recordTouch, setRecordTouch] = useState<boolean | undefined>(undefined);
  // Curated display family (capabilities.family, e.g. 'xeneon-edge') off the
  // matched record - drives which promoted-monitor-only settings apply.
  const [recordFamily, setRecordFamily] = useState<string | undefined>(undefined);
  const surface = device?.runtimeSurface ?? 'y70';
  const isSimulated = device?.connectionKind === 'simulated';
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
  // The iCUE LINK cooler's LCD: its screen module's own controls live in this tab, the
  // way the Kraken's cooler does. Other 'lcd-round' panels have no control channel.
  const isCorsairLinkLcdPanel = recordFamily === 'corsair-link-lcd' && !isSimulated;
  // Cooler LCDs whose firmware takes a backlight command. The service decides
  // which those are and stamps the capability on the record, so a new dimmable
  // model needs no edit here. The setting lives on the record, so it rides the
  // same PATCH as the mounting toggles below rather than its own endpoint.
  const [recordSupportsBrightness, setRecordSupportsBrightness] = useState(false);
  const isDimmableLcdPanel = recordSupportsBrightness && !isSimulated;
  // Streamed cooler LCDs (e.g. the Aftershock Glacier Matrix) whose driver can
  // hand the screen to Windows as a virtual monitor. While on, the service
  // streams the desktop instead of Nexus content and the Widgets/Theme/
  // Background tabs are inert.
  const [recordSupportsSecondaryMonitor, setRecordSupportsSecondaryMonitor] = useState(false);
  const isSecondaryMonitorCapablePanel = recordSupportsSecondaryMonitor && !isSimulated;
  const [recordSecondaryMonitor, setRecordSecondaryMonitor] = useState(false);
  const [recordSecondaryMonitorState, setRecordSecondaryMonitorState] =
    useState<PanelDeviceRecord['secondaryMonitorState']>(null);
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
  // The panel's live orientation, read from the same canvas the preview frame
  // renders, so the immersive-on-load toggle offers exactly the immersive views
  // the device can actually open.
  const previewLandscape = !!previewCanvas && previewCanvas.width > previewCanvas.height;
  const settingsAvailable = supportsDisplayControls || supportsAutoLaunch || ddcSupported
    || monitorRotation || monitorReserve
    // The Xeneon Edge's native settings replace DDC brightness for this
    // family, so it must not depend on ddcSupported/monitorRotation.
    || isXeneonEdgePanel
    // Q60 carries an AIO cooler, so its settings tab hosts the cooler firmware options.
    || surface === 'q60'
    // Same for the Kraken: the glass is a panel, the cooler around it is the
    // settings tab. A simulated one has no cooler to talk to, so the tab would
    // open empty.
    || (surface === 'kraken' && !isSimulated)
    // Cooler glass fed pushed frames: the tab hosts its mount orientation.
    || (surfaceSupportsMountOrientation(surface) && !isSimulated)
    // A dimmable panel earns the tab on its own, so the capability does not
    // depend on the surface also being mount-orientable.
    || isDimmableLcdPanel
    || isSecondaryMonitorCapablePanel;
  const activeTab: Tab = tab === 'settings' && !settingsAvailable ? 'widgets' : tab;
  // Simulator and real hardware share one code path: theme, layout,
  // brightness, orientation, screen-on, and auto-launch all read/write the
  // service's persisted state.
  const panelRecord = usePanelRecord(editingDeviceId);
  const panelTheme = usePanelTheme(panelRecord, editingDeviceId);
  const theme = panelTheme.theme;
  const effectiveThemeMode = theme.themeSyncWithDesktop
    ? (theme.appResolvedThemeMode || theme.appThemeMode)
    : theme.themeMode;
  const resolvedPanelThemeMode = useResolvedPanelThemeMode(effectiveThemeMode);
  // The monitoring settings pane edits the panel's gauge gradient in place; the
  // simulator iframe repaints from the same theme via the postMessage sync.
  const gaugeAccent = panelAccentColor(theme);
  const gaugeGradientValue = useMemo<PanelGaugeGradientValue>(() => ({
    stops: resolveGaugeGradient(theme.gaugeGradient, gaugeAccent),
    source: theme.gaugeGradient,
    accent: gaugeAccent,
    mode: resolvedPanelThemeMode,
    preview: panelTheme.previewGaugeGradient,
    commit: panelTheme.commitGaugeGradient,
  }), [theme.gaugeGradient, gaugeAccent, resolvedPanelThemeMode, panelTheme.previewGaugeGradient, panelTheme.commitGaugeGradient]);
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
        setQSeriesSleepWhenLocked(qDisplay.sleepWhenLocked);
      }
      // /y70/toggle returns the persisted ScreenOff value, not "screen on".
      if (tog) setScreenOn(!tog.toggle);
      const match = matchPanelRecord(devices?.devices, device?.panelRecordId, surface);
      setEditingDeviceId(match?.id ?? null);
      const cw = match?.capabilities?.cssWidth;
      const ch = match?.capabilities?.cssHeight;
      setLiveCanvas(cw && ch ? { width: cw, height: ch } : null);
      setLiveDpr(match?.capabilities?.dpr ?? null);
      setLiveDpi(match?.capabilities?.dpi ?? null);
      // Per-panel persisted settings (promoted monitors).
      setRecordReserve(match?.reserveMonitor ?? true);
      setRecordAutoOrient(match?.autoOrient ?? true);
      setRecordFlip180(match?.flip180 ?? false);
      setRecordMirror(match?.mirror ?? false);
      setRecordLcdBrightness(match?.lcdBrightness ?? DEFAULT_LCD_BRIGHTNESS);
      setRecordSupportsBrightness(match?.capabilities?.supportsBrightness ?? false);
      setRecordSupportsSecondaryMonitor(match?.capabilities?.supportsSecondaryMonitor ?? false);
      setRecordSecondaryMonitor(match?.secondaryMonitor ?? false);
      setRecordSecondaryMonitorState(match?.secondaryMonitorState ?? null);
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
    // A single-widget surface (Q-series, the Kraken's round glass) is exactly
    // its one tile; the multi-page fallback below would offer canvas that does
    // not exist and let the editor place widgets the device cannot show. Same
    // span the runtime derives its grid from, so the two cannot diverge.
    const singleSize = singleWidgetSurfaceSize(surface);
    if (singleSize) {
      const span = sizeToSpan(singleSize);
      return { gridCols: span.cols, pageRows: span.rows };
    }
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
  // fallback guess. Single-widget and y70 fixed grids ARE the runtime grid; monitor is
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

  // Reads the record back into page state. Called from the panel/device
  // broadcast, and from a local write's settle when a broadcast arrived while
  // that write was in flight.
  const refetchDeviceRecord = useCallback(() => {
    if (!editingDeviceId) return;
    // Ignore a result a newer local write overtook while it was in flight.
    const seq = writeSeqRef.current;
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
      // secondaryMonitor/secondaryMonitorState can change from another client
      // or a hardware-settings reset, not just a write from this page, so both
      // must track every broadcast rather than only the initial load.
      setRecordSecondaryMonitor(record.secondaryMonitor ?? false);
      setRecordSecondaryMonitorState(record.secondaryMonitorState ?? null);
      // Only the LAYOUT can be stale here: a local layout write cannot age a
      // canvas or orientation fact, and those setters have no other source
      // after mount - discarding them strands a rotation until remount, and a
      // stale liveCanvas feeds editorCapacity, which the next edit conforms
      // and persists against.
      if (writeSeqRef.current !== seq) return;
      setLayout(normalizePanelLayout(record.layout ?? defaultLayoutForSurface(surface), surface, deviceTouch));
    }).catch(() => {});
  }, [editingDeviceId, surface, deviceTouch]);

  // Every broadcast-driven read goes through this. A write of ours in flight
  // must defer rather than apply, or the echo reverts a controlled field
  // mid-edit; the write's settle runs the deferred read.
  const syncRecordFromBroadcast = useCallback(() => {
    if (pendingWritesRef.current > 0) {
      missedBroadcastRef.current = true;
      return;
    }
    refetchDeviceRecord();
  }, [refetchDeviceRecord]);

  useAppsChangedSync(syncRecordFromBroadcast);
  useMarketplaceRegistryRefresh();

  const updateLayout = useCallback((next: PanelLayout) => {
    // Normalize is geometry-neutral (registry reconcile + size snap only), so
    // conform the geometry to the editor grid before persisting - the stored
    // bytes must be a fixed point of the capacity repair or the preview and
    // the persisted placement diverge. Skipped while the capacity is a
    // fallback guess: the bytes stay un-conformed and every render path
    // re-fits them at its own capacity.
    const normalized = editorCapacityDerived
      ? repaginatePanelLayout(normalizePanelLayout(next, surface, deviceTouch), editorCapacity)
      : normalizePanelLayout(next, surface, deviceTouch);
    setLayout(normalized);
    // Per-device editing path. If no device for this surface is registered
    // yet (no panel of this kind has ever connected), allocate one on first
    // edit so the user's changes persist.
    const persist = (id: string) => {
      pendingWritesRef.current += 1;
      writeSeqRef.current += 1;
      return patchPanelDevice(id, { layout: normalized })
        .then(() => broadcastLayoutChanged())
        .catch(() => {})
        .finally(() => {
          pendingWritesRef.current -= 1;
          if (pendingWritesRef.current === 0 && missedBroadcastRef.current) {
            missedBroadcastRef.current = false;
            refetchDeviceRecord();
          }
        });
    };
    if (editingDeviceId) {
      void persist(editingDeviceId);
      return;
    }
    allocatingRef.current = true;
    void allocatePanelDevice({ surface }, `${surface} panel`).then(record => {
      if (record?.id) {
        setEditingDeviceId(record.id);
        return persist(record.id);
      }
    }).finally(() => { allocatingRef.current = false; });
  }, [editingDeviceId, surface, deviceTouch, editorCapacity, editorCapacityDerived, refetchDeviceRecord]);

  // Reverse sync: when the physical panel (or another editor) saves a layout,
  // the service broadcasts panel/device with the changed id. Refetch this
  // device's record so the preview tracks on-device edits, not just edits made
  // here. PanelEmbedFrame's structural echo-guard makes the refetch from our
  // own writes a no-op. Mirrors usePanelLayout's panel/device subscription.
  useTopicCallback('panel/device', true, (raw) => {
    const frame = raw as { deviceId?: string } | null;
    // No record bound yet: the frame may be the panel's first page load
    // creating one. Bind it so the record-bound controls arm, and complete a
    // pending reboot the panel has come back from. Only the id is taken: the
    // full settings load would re-apply a server snapshot over an edit whose
    // PATCH has not been issued yet. Our own allocate binds on its response.
    if (!editingDeviceId) {
      if (allocatingRef.current) return;
      void fetchPanelDevices().then(list => {
        const match = matchPanelRecord(list?.devices, device?.panelRecordId, surface);
        if (!match) return;
        setEditingDeviceId(match.id);
        const since = rebootRequestedAtRef.current;
        if (since !== null && (match.lastSeenAt ?? 0) > since) {
          rebootRequestedAtRef.current = null;
          setRebootingPanel(false);
        }
      }).catch(() => {});
      return;
    }
    if (frame?.deviceId !== editingDeviceId) return;
    // The frame carries no payload and fires for this client's own writes too,
    // so its arrival cannot end a reboot on its own. lastSeenAt advancing past
    // the request is what proves the panel came back; checked ahead of the
    // pending-write guard because it reads the record without applying it.
    if (rebootRequestedAtRef.current !== null) {
      void fetchPanelDevice(editingDeviceId).then(record => {
        const since = rebootRequestedAtRef.current;
        if (since === null || !record) return;
        if ((record.lastSeenAt ?? 0) > since) {
          rebootRequestedAtRef.current = null;
          setRebootingPanel(false);
        }
      }).catch(() => {});
    }
    syncRecordFromBroadcast();
  });

  const singleWidget = isSingleWidgetSurface(surface);
  const currentSingleWidget: PanelWidget | undefined = singleWidget
    ? layout.pages[0]?.widgets[0]
    : undefined;

  // Returns the id of the widget that landed so the catalog can offer
  // "click to edit" on the card that was just clicked.
  const handleAddWidget = useCallback((type: string, size: PanelWidgetSize): string | undefined => {
    if (singleWidget) {
      // Single-widget surface (q-series): one widget at a time, fixed 2x4.
      // Clicking the catalog tile already on the device is a no-op.
      const current = layout.pages[0]?.widgets[0];
      // Already the widget on the device: nothing lands, so report no add (the
      // catalog would otherwise confirm a widget it never placed).
      if (current && current.type === type) return undefined;
      // swapSingleWidget preserves each type's config on the layout, so
      // switching widgets restores prior settings (persisted like multi-widget
      // panels' configs, not reset on every swap).
      const next: PanelWidget = { id: createUuid(), type, size, col: 0, row: 0 };
      updateLayout(swapSingleWidget(layout, next));
      return next.id;
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
    // appendWidget refuses a full grid; only report an id the layout kept.
    return landingPage ? next.id : undefined;
  }, [editorCapacity, layout, singleWidget, updateLayout]);

  const handleRemoveWidget = useCallback((widgetId: string) => {
    updateLayout(removeWidgetById(layout, widgetId, editorCapacity));
    // The derived lookup already closes the pane, but a swallowed PATCH
    // failure could let a later refetch re-supply the widget and reopen it.
    setConfiguringWidgetId(prev => prev === widgetId ? null : prev);
  }, [editorCapacity, layout, updateLayout]);

  const handleConfigureWidget = useCallback((widget: PanelWidget) => {
    setConfiguringWidgetId(widget.id);
  }, []);

  const handleUpdateWidgetConfig = useCallback((widgetId: string, config: Record<string, PanelConfigValue>) => {
    updateLayout(patchWidgetById(layout, widgetId, w => ({ ...w, config }), editorCapacity));
  }, [editorCapacity, layout, updateLayout]);

  const handleImmersiveOnLoad = useCallback((widgetId: string, on: boolean) => {
    updateLayout(setImmersiveOnLoadWidgetId(layout, on ? widgetId : null));
  }, [layout, updateLayout]);

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

  // Both actions return once QUEUED, so the busy flag is cleared by the signal
  // that the work finished, not by this call: the panel/device topic firing
  // again for a reboot (the panel re-contacted the service), and the shared
  // flash status leaving its active phases for a factory reset. A null result
  // is a rejected request (no panel, or an install holds the transport).
  const rebootPanel = useCallback(async () => {
    setRebootPanelConfirmOpen(false);
    rebootRequestedAtRef.current = Date.now();
    setRebootingPanel(true);
    const ok = await rebootQSeriesPanel();
    pushToast({
      title: ok ? t('devices.q60.rebootPanel.started') : t('devices.q60.rebootPanel.error'),
    });
    if (!ok) { rebootRequestedAtRef.current = null; setRebootingPanel(false); }
  }, [pushToast, t]);

  // A panel whose USB gadget wedges never re-registers (recovery is a physical
  // replug), so the completion signal above can never arrive. Release the
  // control after a bound well past the ~2 min cold qshell bootstrap rather
  // than leaving the row dead until the page remounts.
  useEffect(() => {
    if (!rebootingPanel) return;
    const timer = window.setTimeout(() => {
      rebootRequestedAtRef.current = null;
      setRebootingPanel(false);
      pushToast({ title: t('devices.q60.rebootPanel.timeout') });
    }, REBOOT_COMPLETION_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [rebootingPanel, pushToast, t]);

  const { status: flashStatus } = useFlashStatus(factoryResettingPanel);
  useEffect(() => {
    if (!factoryResettingPanel || !flashStatus) return;
    if (flashStatus.phase === 'done' || flashStatus.phase === 'failed') {
      setFactoryResettingPanel(false);
      pushToast({
        title: flashStatus.success
          ? t('devices.q60.factoryResetPanel.done')
          : t('devices.q60.factoryResetPanel.error'),
      });
    }
  }, [factoryResettingPanel, flashStatus, pushToast, t]);

  const factoryResetPanel = useCallback(async () => {
    if (!editingDeviceId) return;
    setFactoryResetConfirmOpen(false);
    setFactoryResettingPanel(true);
    const ok = await factoryResetPanelDevice(editingDeviceId);
    // The service already wiped the record; re-read so this page stops showing
    // the pre-reset layout and hardware values.
    if (ok) { broadcastLayoutChanged(); setSettingsRefreshNonce(n => n + 1); }
    pushToast({
      title: ok ? t('devices.q60.factoryResetPanel.started') : t('devices.q60.factoryResetPanel.error'),
    });
    if (!ok) setFactoryResettingPanel(false);
  }, [editingDeviceId, pushToast, t]);

  const tabs: { key: Tab; label: string; icon: ReactNode }[] = [
    { key: 'widgets', label: t('devices.y70.tab.widgets'), icon: <LayoutGrid size={14} /> },
    { key: 'theme', label: t('devices.y70.tab.theme'), icon: <Palette size={14} /> },
    { key: 'background', label: t('devices.y70.theme.background'), icon: <Wallpaper size={14} /> },
    ...(settingsAvailable
      ? [{ key: 'settings' as const, label: t('devices.y70.tab.settings'), icon: <Settings size={14} /> }]
      : []),
  ];

  // Page title appends the localized "(Simulated)" suffix when the
  // device is a simulator. usePanelDevices keeps device.name bare
  // (so the sidebar entry stays compact: "Q60" / "Y70"), and the
  // suffix is applied here uniformly for every simulated panel.
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
  // Both operations take the panel off adb, and the factory reset spends a
  // window with it back but qshell absent. Without this the page swaps the tab
  // for the disconnected state or an "install the panel app" CTA mid-operation,
  // hiding the progress and inviting a flash the flash gate would reject.
  const panelOperationInFlight = rebootingPanel || factoryResettingPanel;
  const showFwGate = isQSeries && !isSimulated && fwGateReady && panelReachable && !panelAppInstalled && !panelOperationInFlight;
  const showDisconnected = isQSeries && !isSimulated && fwGateReady && !panelReachable && !panelOperationInFlight;

  // Distinguishes why a Q-series panel isn't reachable: unplugged, USB
  // enumerated but adb wedged, or Windows holding a deferred USB reset that
  // only a host restart clears. Null (endpoint failed, or not yet fetched)
  // reads the same as usbPresent=false - the unplugged copy.
  const [qseriesLinkState, setQseriesLinkState] = useState<QSeriesLinkState | null>(null);
  const [repairingQseriesLink, setRepairingQseriesLink] = useState(false);
  const qseriesLinkMountedRef = useRef(true);
  useEffect(() => () => { qseriesLinkMountedRef.current = false; }, []);
  // The background poll and a repair poll loop both call getQSeriesLinkState;
  // only the response to the most recently issued call is applied, so a slow
  // background tick can never overwrite a fresher repair result out of order.
  const qseriesLinkRequestIdRef = useRef(0);
  // Bumped on every repair click. A loop compares its own token each tick and
  // stops touching state once superseded, so a panel-state flap that resets
  // repairingQseriesLink and lets the user re-click can't leave two loops
  // fighting over the same spinner.
  const qseriesLinkRepairTokenRef = useRef(0);

  useEffect(() => {
    if (!showDisconnected) {
      setQseriesLinkState(null);
      setRepairingQseriesLink(false);
      qseriesLinkRepairTokenRef.current += 1;
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      const requestId = ++qseriesLinkRequestIdRef.current;
      const state = await getQSeriesLinkState();
      if (cancelled || requestId !== qseriesLinkRequestIdRef.current) return;
      setQseriesLinkState(state);
    };
    void refresh();
    const intervalId = window.setInterval(() => { void refresh(); }, QSERIES_LINK_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [showDisconnected]);

  // Fire-and-forget repair: the response carries no outcome, so poll the link
  // state until adb comes back or the bound expires, driving the button's
  // spinner off either result.
  const repairQseriesLinkNow = useCallback(async () => {
    const myToken = ++qseriesLinkRepairTokenRef.current;
    setRepairingQseriesLink(true);
    await repairQSeriesLink();
    const deadline = Date.now() + QSERIES_LINK_REPAIR_POLL_TIMEOUT_MS;
    const poll = async () => {
      const requestId = ++qseriesLinkRequestIdRef.current;
      const state = await getQSeriesLinkState();
      if (!qseriesLinkMountedRef.current || myToken !== qseriesLinkRepairTokenRef.current) return;
      if (requestId === qseriesLinkRequestIdRef.current) setQseriesLinkState(state);
      if (state?.adbOnline || Date.now() >= deadline) {
        setRepairingQseriesLink(false);
        return;
      }
      window.setTimeout(() => { void poll(); }, QSERIES_LINK_REPAIR_POLL_INTERVAL_MS);
    };
    void poll();
  }, []);

  const showQseriesUnresponsive = showDisconnected
    && !!qseriesLinkState?.usbPresent && !qseriesLinkState.adbOnline && !qseriesLinkState.hostRebootPending;
  const showQseriesNeedsHostReboot = showDisconnected
    && !!qseriesLinkState?.usbPresent && !qseriesLinkState.adbOnline && qseriesLinkState.hostRebootPending;

  return (
    <section className={styles.page}>
      <ViewHeader
        title={pageTitle}
        tabs={showFwGate || showDisconnected ? undefined : tabs}
        activeTab={activeTab}
        onTabChange={(k) => { setConfiguringWidgetId(null); setTab(k as Tab); }}
        // Only where there is a panel to capture: the firmware-gate and
        // disconnected states render an EmptyState with no embed frame, so the
        // button could do nothing but report an error.
        tabActions={showFwGate || showDisconnected ? undefined : (
          <>
            <Button
              size="sm"
              tone="ghost"
              className={styles.headerAction}
              icon={<Camera size={14} />}
              title={t('devices.panels.screenshot')}
              aria-label={t('devices.panels.screenshot')}
              loading={screenshotBusy}
              onClick={() => { void takeScreenshot(); }}
            />
          </>
        )}
      />
      <div className={`${styles.pageBody} pageBody`}>
      {!fwGateReady ? (
        <div style={{ color: 'var(--text-dim)', padding: 20 }}>{t('devices.loading')}</div>
      ) : showQseriesUnresponsive ? (
        <EmptyState
          icon={<Unplug size={48} />}
          title={t('devices.qseries.unresponsive.title')}
          hint={t('devices.qseries.unresponsive.hint')}
          action={
            <Button type="button" tone="accent" loading={repairingQseriesLink} onClick={() => { void repairQseriesLinkNow(); }}>
              {t('devices.qseries.unresponsive.cta')}
            </Button>
          }
        />
      ) : showQseriesNeedsHostReboot ? (
        <EmptyState
          icon={<Unplug size={48} />}
          title={t('devices.qseries.needsHostReboot.title')}
          hint={t('devices.qseries.needsHostReboot.hint')}
        />
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
              <PanelGaugeGradientProvider value={gaugeGradientValue}>
              <InlineWidgetSettings
                key={configuringWidget.id}
                widget={configuringWidget}
                surface={surface}
                deviceTouch={deviceTouch}
                themeMode={desktopResolvedThemeMode}
                themeStyle={panelPreviewThemeStyle}
                docked={dockPreview}
                onBack={() => setConfiguringWidgetId(null)}
                onUpdate={handleUpdateWidgetConfig}
                onResize={handleResizeWidget}
                onRemove={handleRemoveWidget}
                immersiveOnLoadAvailable={
                  canMarkImmersiveOnLoad(layout, configuringWidget, surface, previewLandscape, deviceTouch)
                }
                immersiveOnLoad={isImmersiveOnLoadWidget(layout, configuringWidget.id)}
                onImmersiveOnLoadChange={handleImmersiveOnLoad}
                onSectionNavigate={onSectionNavigate}
              />
              </PanelGaugeGradientProvider>
            ) : (
              <>
                <div className={`${styles.tabContent}${activeTab === 'widgets' ? ` ${styles.tabContentCatalog}` : ''}`}>
                  {activeTab === 'widgets' && (
                    <>
                      {recordSecondaryMonitor && (
                        <div className={styles.usbNotice}>
                          <AlertTriangle size={14} aria-hidden />
                          <span>{t('devices.lcd.secondaryMonitorNotice')}</span>
                        </div>
                      )}
                      <div
                        className={recordSecondaryMonitor ? styles.tabDisabled : undefined}
                        aria-disabled={recordSecondaryMonitor || undefined}
                        inert={recordSecondaryMonitor || undefined}
                      >
                        <PanelWidgetCatalog
                          surface={surface}
                          deviceTouch={deviceTouch}
                          onAdd={handleAddWidget}
                          onEditWidget={setConfiguringWidgetId}
                          placedTypes={placedTypes}
                          variant="desktop-modal"
                          remote={isRemotePanel(device?.connectionKind)}
                          className={styles.catalog}
                          selectedWidgetType={currentSingleWidget?.type}
                          themeMode={desktopResolvedThemeMode}
                          themeStyle={panelPreviewThemeStyle}
                        />
                      </div>
                    </>
                  )}
                  {(activeTab === 'theme' || activeTab === 'background') && (() => {
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
                      <>
                        {recordSecondaryMonitor && (
                          <div className={styles.usbNotice}>
                            <AlertTriangle size={14} aria-hidden />
                            <span>{t('devices.lcd.secondaryMonitorNotice')}</span>
                          </div>
                        )}
                        <div
                          className={recordSecondaryMonitor ? styles.tabDisabled : undefined}
                          aria-disabled={recordSecondaryMonitor || undefined}
                          inert={recordSecondaryMonitor || undefined}
                        >
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
                            onBackgroundSlideshowCommit={panelTheme.commitBackgroundSlideshow}
                            onBackgroundMediaOrderCommit={panelTheme.commitBackgroundMediaOrder}
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
                            sections={activeTab}
                          />
                        </div>
                      </>
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
                      sleepWhenLocked={null}
                      onSleepWhenLockedToggle={() => {}}
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
                        sleepWhenLocked={qSeriesSleepWhenLocked}
                        onSleepWhenLockedToggle={() => {
                          const next = !qSeriesSleepWhenLocked;
                          setQSeriesSleepWhenLocked(next);
                          void setQSeriesDisplay({ sleepWhenLocked: next }).catch(() => {});
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
                  {activeTab === 'settings' && isDimmableLcdPanel && (
                    <MonitorSettingsPanel
                      brightness={recordLcdBrightness}
                      onBrightnessPreview={setRecordLcdBrightness}
                      onBrightness={(value) => {
                        setRecordLcdBrightness(value);
                        if (device?.panelRecordId) void patchPanelDevice(device.panelRecordId, { lcdBrightness: value }).catch(() => {});
                      }}
                      // Backlight is the only hardware control this panel family
                      // exposes; mounting lives in its own section below.
                      orientation={null}
                      onOrientation={() => {}}
                      orientationOptions={[]}
                      screenOff={null}
                      onScreenOffToggle={() => {}}
                      sleepWithHost={null}
                      onSleepWithHostToggle={() => {}}
                      sleepWhenLocked={null}
                      onSleepWhenLockedToggle={() => {}}
                      autoOrient={null}
                      onAutoOrientToggle={() => {}}
                      reserveMonitor={null}
                      onReserveMonitorToggle={() => {}}
                      xeneonSettings={null}
                      onXeneonChange={() => {}}
                      onXeneonCommit={() => {}}
                      hardwareResetBusy={resettingHardware}
                    />
                  )}
                  {/* The iCUE LINK LCD rotates in firmware across all four quarter turns
                      (its own section below), so the software flip would double-apply. */}
                  {activeTab === 'settings' && surfaceSupportsMountOrientation(surface) && !isSimulated
                    && !isCorsairLinkLcdPanel && (
                    <div className={styles.settingsContent}>
                      <SettingsSection title={t('devices.lcd.mounting')} boxClassName={styles.deviceSettingsBox}>
                        <SettingToggle
                          label={t('devices.lcd.flip180')}
                          checked={recordFlip180}
                          onChange={() => {
                            const next = !recordFlip180;
                            setRecordFlip180(next);
                            if (device?.panelRecordId) void patchPanelDevice(device.panelRecordId, { flip180: next }).catch(() => {});
                          }}
                        />
                        <SettingToggle
                          label={t('devices.lcd.mirror')}
                          checked={recordMirror}
                          onChange={() => {
                            const next = !recordMirror;
                            setRecordMirror(next);
                            if (device?.panelRecordId) void patchPanelDevice(device.panelRecordId, { mirror: next }).catch(() => {});
                          }}
                        />
                      </SettingsSection>
                    </div>
                  )}
                  {activeTab === 'settings' && isSecondaryMonitorCapablePanel && (
                    <div className={styles.settingsContent}>
                      <SettingsSection title={t('devices.lcd.secondaryMonitorSection')} boxClassName={styles.deviceSettingsBox}>
                        <SettingToggle
                          label={t('devices.lcd.secondaryMonitor')}
                          description={t('devices.lcd.secondaryMonitorHint')}
                          checked={recordSecondaryMonitor}
                          onChange={() => {
                            const next = !recordSecondaryMonitor;
                            setRecordSecondaryMonitor(next);
                            if (!next) setRecordSecondaryMonitorState(null);
                            if (device?.panelRecordId) void patchPanelDevice(device.panelRecordId, { secondaryMonitor: next }).catch(() => {});
                          }}
                        />
                        {recordSecondaryMonitor && recordSecondaryMonitorState === 'driver-missing' && (
                          <div className={styles.usbNotice}>
                            <AlertTriangle size={14} aria-hidden />
                            <span>{t('devices.lcd.secondaryMonitorDriverMissing')}</span>
                          </div>
                        )}
                        {recordSecondaryMonitor && recordSecondaryMonitorState === 'failed' && (
                          <div className={styles.usbNotice}>
                            <AlertTriangle size={14} aria-hidden />
                            <span>{t('devices.lcd.secondaryMonitorFailed')}</span>
                          </div>
                        )}
                        {recordSecondaryMonitor && recordSecondaryMonitorState === 'starting' && (
                          <SettingRow label={t('devices.lcd.secondaryMonitorStarting')} />
                        )}
                      </SettingsSection>
                    </div>
                  )}
                  {activeTab === 'settings' && isCorsairLinkLcdPanel && (
                    <div className={styles.settingsContent}>
                      <CorsairLcdSettings />
                    </div>
                  )}
                  {activeTab === 'settings' && surface === 'kraken' && !isSimulated && (
                    <div className={styles.settingsContent}>
                      <KrakenCoolerSettings onSectionNavigate={onSectionNavigate} screenStreamed />
                    </div>
                  )}
                  {/* Panel devices with a settings tab (Y70 / Q-series /
                      promoted monitors) get the per-device resets below the
                      surface-specific settings: personalization (the Widgets +
                      Theme tabs) and hardware settings (this tab). Gated on the
                      device, not its panel record: the record is created by the
                      panel page's first load, Reboot panel takes no record id,
                      and the record-bound resets disable until one binds. */}
                  {activeTab === 'settings' && !isSimulated && (
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
                            disabled={resettingPersonalization || !editingDeviceId}
                          >
                            {t('devices.panels.resetPersonalization.button')}
                          </Button>
                        </SettingRow>
                        <SettingRow
                          label={t('devices.panels.resetHardware.label')}
                          description={t(isQSeries
                            ? 'devices.panels.resetHardware.descriptionQSeries'
                            : 'devices.panels.resetHardware.description')}
                        >
                          <Button
                            type="button"
                            tone="danger"
                            size="sm"
                            onClick={() => setResetHardwareConfirmOpen(true)}
                            disabled={resettingHardware || !editingDeviceId}
                          >
                            {t('devices.panels.resetHardware.button')}
                          </Button>
                        </SettingRow>
                        {isQSeries && (
                          <>
                            <SettingRow
                              label={t('devices.q60.rebootPanel.label')}
                              description={t('devices.q60.rebootPanel.description')}
                            >
                              <Button
                                type="button"
                                tone="danger"
                                size="sm"
                                onClick={() => setRebootPanelConfirmOpen(true)}
                                disabled={rebootingPanel || factoryResettingPanel}
                              >
                                {rebootingPanel
                                  ? t('devices.q60.rebootPanel.busy')
                                  : t('devices.q60.rebootPanel.button')}
                              </Button>
                            </SettingRow>
                            <SettingRow
                              label={t('devices.q60.factoryResetPanel.label')}
                              description={t('devices.q60.factoryResetPanel.description')}
                            >
                              <Button
                                type="button"
                                tone="danger"
                                size="sm"
                                onClick={() => setFactoryResetConfirmOpen(true)}
                                disabled={factoryResettingPanel || rebootingPanel || !editingDeviceId}
                              >
                                {factoryResettingPanel
                                  ? t('devices.q60.factoryResetPanel.busy')
                                  : t('devices.q60.factoryResetPanel.button')}
                              </Button>
                            </SettingRow>
                          </>
                        )}
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
                onBackgroundClicked={() => setConfiguringWidgetId(null)}
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
        bullets={t(isQSeries
          ? 'devices.panels.resetHardware.wipeListQSeries'
          : 'devices.panels.resetHardware.wipeList').split('\n')}
        note={t('devices.panels.resetHardware.confirmNote')}
        confirmLabel={t('devices.panels.resetHardware.confirmButton')}
        destructive
        onConfirm={() => void resetHardware()}
        onCancel={() => setResetHardwareConfirmOpen(false)}
      />
      <ConfirmModal
        open={rebootPanelConfirmOpen}
        title={t('devices.q60.rebootPanel.confirmTitle')}
        message={t('devices.q60.rebootPanel.confirmMessage')}
        note={t('devices.q60.rebootPanel.confirmNote')}
        confirmLabel={t('devices.q60.rebootPanel.confirmButton')}
        onConfirm={() => void rebootPanel()}
        onCancel={() => setRebootPanelConfirmOpen(false)}
      />
      <ConfirmModal
        open={factoryResetConfirmOpen}
        title={t('devices.q60.factoryResetPanel.confirmTitle')}
        message={t('devices.q60.factoryResetPanel.confirmMessage')}
        bullets={t('devices.q60.factoryResetPanel.wipeList').split('\n')}
        note={t('devices.q60.factoryResetPanel.confirmNote')}
        // eslint-disable-next-line i18next/no-literal-string -- note tone enum value
        noteTone="danger"
        confirmLabel={t('devices.q60.factoryResetPanel.confirmButton')}
        destructive
        onConfirm={() => void factoryResetPanel()}
        onCancel={() => setFactoryResetConfirmOpen(false)}
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
  // Set when the canvas is docked below (landscape strips), which gives this
  // block the full page width.
  docked?: boolean;
  onBack: () => void;
  onUpdate: (widgetId: string, config: Record<string, PanelConfigValue>) => void;
  onResize: (widgetId: string, size: PanelWidgetSize) => void;
  onRemove: (widgetId: string) => void;
  // Whether this widget can be marked immersive-on-load: a first-page widget
  // with an immersive view in the panel's current orientation.
  immersiveOnLoadAvailable?: boolean;
  immersiveOnLoad?: boolean;
  onImmersiveOnLoadChange?: (widgetId: string, on: boolean) => void;
  onSectionNavigate?: (section: string) => void;
}

function InlineWidgetSettings({ widget, surface, deviceTouch, themeMode = 'dark', themeStyle, docked, onBack, onUpdate, onResize, onRemove, immersiveOnLoadAvailable = false, immersiveOnLoad = false, onImmersiveOnLoadChange, onSectionNavigate }: InlineWidgetSettingsProps) {
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
  const slotLayoutOptions = isMonitoringWidget ? slotLayoutOptionsForSize(widget.size) : [];
  const slotLayout = resolvedSlotLayout(widget.size, widget.config);
  const [selectedMonitoringSlot, setSelectedMonitoringSlot] = useState(0);
  const [deckEditView, setDeckEditView] = useState<DeckEditView>({ page: 0, folderPath: [] });

  // The preview tile (draggable in edit mode) and DeckSettings below it both
  // bind to this same instance; sharing one useDeckInstance call through
  // DeckInstanceProvider keeps a tile drag and an inspector edit from racing
  // each other's independent auto-saves (see useDeckInstance.ts).
  const isDeckWidget = widget.type === 'deck';
  const deckInstanceId = isDeckWidget ? `widget:${widget.id}` : null;
  const deckInstanceGrid = isDeckWidget ? innerGridForSize(widget.size) : { cols: 0, rows: 0 };
  const sharedDeckInstance = useDeckInstance(deckInstanceId, 'widget', deckInstanceGrid, true);

  const handleConfigUpdate = (config: Record<string, PanelConfigValue>) => {
    onUpdate(widget.id, { ...widget.config, ...config });
  };

  const handleResize = (size: PanelWidgetSize) => {
    setSelectedMonitoringSlot(slot => Math.min(slot, resolvedSlotCountForSize(size, widget.config?.slotCount as number | undefined) - 1));
    onResize(widget.id, size);
  };

  const handleSlotLayout = (layout: SlotLayout) => {
    setSelectedMonitoringSlot(slot => Math.min(slot, layout.count - 1));
    handleConfigUpdate({ slotCount: layout.count, slotHero: layout.hero });
  };

  const Icon = def?.meta.icon;

  return (
    <DeckInstanceProvider value={isDeckWidget ? { instanceId: deckInstanceId!, value: sharedDeckInstance } : null}>
    <div className={styles.inlineSettings} data-docked={docked ? 'true' : undefined}>
      <div className={styles.inlineSettingsHeader}>
        <button type="button" className={styles.backBtn} onClick={onBack} aria-label={t('devices.panels.widgetSettings.back')}>
          <ArrowLeft size={16} />
        </button>
        <div className={styles.inlineSettingsTitle}>
          {Icon && <Icon size={16} />}
          <span>{widgetLabel}</span>
        </div>
        <div className={styles.inlineSettingsActions}>
          {/* Single-widget surfaces (Q-series, Kraken) can't be left empty:
              the widget is replaced from the catalog, never removed. */}
          {!isSingleWidgetSurface(surface) && (
            <button
              type="button"
              className={styles.inlineRemoveBtn}
              onClick={() => onRemove(widget.id)}
              aria-label={t('devices.panels.widgetSettings.remove')}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {def && (
        <div className={styles.inlineSettingsPreview}>
          {(() => {
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
                <div className={`panel-card ${styles.inlineSettingsPreviewCard}`} data-size={widget.size} data-widget-type={widget.type}>
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
                      // Same semantics as the canvas tile: this preview shows the
                      // same nav arrows, so pressing one has to mean the same
                      // thing rather than moving a throwaway view.
                      onUpdate={def.meta.persistsFromTile ? handleConfigUpdate : undefined}
                      editorPreview={def.meta.persistsFromTile ? true : undefined}
                    />
                  </ErrorBoundary>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      <div className={styles.inlineSettingsBody}>
        {(sizes.length > 1 || slotLayoutOptions.length > 1) && (
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
            {isMonitoringWidget && slotLayoutOptions.length > 0 && (
              <WidgetControlGroup title={t('devices.panels.widgetSettings.slots')}>
                {slotLayoutOptions.map(option => {
                  const slotLabel = option.hero
                    ? t('devices.panels.widgetSettings.slotHero')
                    : t('devices.panels.widgetSettings.slotCount', { count: option.count });
                  return (
                    <IconLabelButton
                      key={slotLayoutKey(option)}
                      className={styles.inlineIconButton}
                      active={option.count === slotLayout.count && option.hero === slotLayout.hero}
                      icon={<SlotLayoutIcon layout={option} size={widget.size} aria-hidden="true" />}
                      ariaLabel={slotLabel}
                      title={slotLabel}
                      onPress={() => handleSlotLayout(option)}
                    />
                  );
                })}
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
        ) : immersiveOnLoadAvailable ? null : (
          <div className={styles.inlineSettingsEmpty}>
            {t('peripheral.noCapabilities') || t('devices.panels.widgetSettings.noConfigurableSettings')}
          </div>
        )}

        {immersiveOnLoadAvailable && onImmersiveOnLoadChange && (
          <SettingsSection title={t('devices.panels.widgetSettings.immersiveOnLoad.title')}>
            <SettingToggle
              label={t('devices.panels.widgetSettings.immersiveOnLoad')}
              description={t('devices.panels.widgetSettings.immersiveOnLoad.hint')}
              checked={immersiveOnLoad}
              onChange={on => onImmersiveOnLoadChange(widget.id, on)}
            />
          </SettingsSection>
        )}
      </div>
    </div>
    </DeckInstanceProvider>
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
  // Live value during a drag. Given one, the row persists on commit only - a
  // consumer whose brightness is a panel-record field cannot afford a write per
  // tick. Without one every change persists, which is what the DDC and
  // Q-series rows have always done.
  onBrightnessPreview?: (v: number) => void;
  orientation: Y70Orientation | null;
  onOrientation: (v: Y70Orientation) => void;
  orientationOptions: readonly Y70Orientation[];
  screenOff: boolean | null;
  onScreenOffToggle: () => void;
  sleepWithHost: boolean | null;
  onSleepWithHostToggle: () => void;
  sleepWhenLocked: boolean | null;
  onSleepWhenLockedToggle: () => void;
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
  brightness, onBrightness, onBrightnessPreview,
  orientation, onOrientation, orientationOptions,
  screenOff, onScreenOffToggle,
  sleepWithHost, onSleepWithHostToggle,
  sleepWhenLocked, onSleepWhenLockedToggle,
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
          // A reset that owns this value rewrites it, so the row must not take
          // input while one is in flight.
          disabled={hardwareResetBusy}
          onChange={(value) => {
            // With a preview handler every write comes from onCommit, which the
            // slider fires for a drag, a keyboard step and a typed edit alike.
            // Persisting here too would write a typed edit twice.
            if (onBrightnessPreview) onBrightnessPreview(value);
            else onBrightness(value);
          }}
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
      {sleepWhenLocked !== null && (
        <SettingToggle
          label={t('devices.qseries.sleepWhenLocked')}
          checked={sleepWhenLocked}
          onChange={onSleepWhenLockedToggle}
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
