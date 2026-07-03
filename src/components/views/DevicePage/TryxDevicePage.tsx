import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Monitor, MonitorOff, Wind, Film, Download } from 'lucide-react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { Spinner } from '../../common/Spinner/Spinner';
import { Select } from '../../common/Select/Select';
import { Slider } from '../../common/Slider/Slider';
import { Toggle } from '../../common/Toggle/Toggle';
import { Button } from '../../common/Button/Button';
import { ChipGroup } from '../../common/ChipGroup/ChipGroup';
import { HsvPicker } from '../../common/HsvPicker/HsvPicker';
import { EffectCard } from '../../common/EffectCard/EffectCard';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { MediaCropper, type NormalizedCrop } from '../../common/MediaCropper/MediaCropper';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { CurveGraph } from '../../../panel/widgets/cooling/page/CurveEditor';
import type { CurvePoint } from '../../../api/cooling';
import { useSensors } from '../../../hooks/useSensors';
import { useNetworkMonitor } from '../../../hooks/useNetworkMonitor';
import { buildNetworkSensors } from '../../../panel/widgets/monitoring/networkSensors';
import {
  getTryxStatus,
  getTryxPresets,
  getTryxMedia,
  getTryxCloudCatalog,
  installTryxCloudMaterial,
  setTryxEnabled,
  setTryxBrightness,
  setTryxFan,
  setTryxPreset,
  selectTryxMedia,
  deleteTryxMedia,
  setTryxOverlay,
  uploadTryxMedia,
  TRYX_MEDIA_WIDTH,
  TRYX_MEDIA_HEIGHT,
  type TryxStatus,
  type TryxPreset,
  type TryxMediaItem,
  type TryxFanMode,
  type TryxCloudMaterial,
  type TryxOverlayItem,
} from '../../../api/tryx';
import {
  applyDockedOverlayLayout,
  clampUnit,
  dockedOverlayItemPosition,
  isTryxOverlayAlign,
  isTryxSensorGroup,
  scalePanelMetric,
  tryxFontCssStyle,
  tryxOverlayJustifyStyle,
  tryxOverlayPreviewValue,
  tryxSensorOptionsForGroup,
  TRYX_FONTS,
  TRYX_FONT_LABEL_KEYS,
  TRYX_LABEL_FONT_PANEL_PX,
  TRYX_LABEL_OFFSET_PANEL_PX,
  TRYX_OVERLAY_ALIGNS,
  TRYX_OVERLAY_ALIGN_LABEL_KEYS,
  TRYX_SENSOR_GROUPS,
  TRYX_SENSOR_GROUP_LABEL_KEYS,
  TRYX_VALUE_FONT_PANEL_PX,
  type TryxOverlayAlign,
  type TryxSensorGroup,
  type TryxSensorsByGroup,
} from './tryxOverlayUtils';
import { useTranslation } from '../../../lib/i18n';
import { useTryxSimulated } from '../../../lib/tryxSimulation';
import styles from './TryxDevicePage.module.scss';

// Debounce window for pushing overlay edits (item/font/size/color/align/
// docked/drag) to the service - long enough to coalesce a drag's pointermove
// flood into one request, short enough to feel live.
const OVERLAY_PUSH_DEBOUNCE_MS = 150;
const OVERLAY_KEYBOARD_STEP = 0.01;
const OVERLAY_ITEM_SLOTS = [0, 1, 2, 3] as const;
const DEFAULT_OVERLAY_ALIGN: TryxOverlayAlign = 'left';
const DEFAULT_OVERLAY_DOCKED = true;

const STATUS_POLL_MS = 4000;
const MEDIA_POLL_MS = 8000;
const UPLOAD_ASPECT = TRYX_MEDIA_WIDTH / TRYX_MEDIA_HEIGHT;

// Custom uploads carry the on-device filename (stem + ".mp4.h264_2240x1080");
// show just the stem in the library.
const mediaDisplayName = (deviceName: string): string => deviceName.split('.mp4')[0] || deviceName;

const DEFAULT_CURVE: CurvePoint[] = [
  { temp: 0, speed: 20 },
  { temp: 50, speed: 40 },
  { temp: 75, speed: 70 },
  { temp: 100, speed: 100 },
];

interface OverlayItemState {
  enabled: boolean;
  device: TryxSensorGroup;
  sensorId: string;
  /** Concise label sent to the service and shown on the panel/preview. */
  label: string;
  /** Sensor type at pick time - local-only fallback for the preview
   *  placeholder if the live sensor later drops out; never sent to the service. */
  sensorType: string;
  /** Normalized justification anchor / top of the value text, 0..1. */
  x: number;
  y: number;
}

const DEFAULT_OVERLAY_ITEMS: OverlayItemState[] = OVERLAY_ITEM_SLOTS.map(i => ({
  enabled: i === 0,
  device: 'cpu',
  sensorId: '',
  label: '',
  sensorType: '',
  ...dockedOverlayItemPosition(DEFAULT_OVERLAY_ALIGN, i),
}));

type TryxTab = 'display' | 'media' | 'cooling';

/**
 * Native first-party page for the Tryx Panorama AIO screen (Display / Media /
 * Cooling), driving the `/tryx/*` routes.
 *
 * Optimistic-state race avoidance: brightness and the overlay block win locally
 * until the polled status confirms them (brightnessInteractingRef /
 * overlayInitRef), and the selected media/preset stay pinned to the user's pick
 * until the service reports it back.
 */
export function TryxDevicePage() {
  const { t } = useTranslation();
  const simulated = useTryxSimulated();
  const [status, setStatus] = useState<TryxStatus | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [presets, setPresets] = useState<TryxPreset[]>([]);
  const [media, setMedia] = useState<TryxMediaItem[]>([]);
  const [cloudCatalog, setCloudCatalog] = useState<TryxCloudMaterial[]>([]);
  const [cloudInstallingId, setCloudInstallingId] = useState<number | null>(null);
  const [cloudInstallError, setCloudInstallError] = useState<{ id: number; msg: string } | null>(null);
  const [tab, setTab] = useState<TryxTab>('display');

  const [brightness, setBrightness] = useState(80);
  // Fan mode/curve are write-only: the cooler's status stream carries no fan
  // config, so these default to Smart and only reflect edits made in-session.
  const [fanMode, setFanMode] = useState<TryxFanMode>('smart');
  const [fanFixed, setFanFixed] = useState(50);
  const [fanCurve, setFanCurve] = useState<CurvePoint[]>(DEFAULT_CURVE);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [screenOverride, setScreenOverride] = useState<boolean | null>(null);
  const [overlayItems, setOverlayItems] = useState<OverlayItemState[]>(DEFAULT_OVERLAY_ITEMS);
  const [overlayFont, setOverlayFont] = useState<string>(TRYX_FONTS[0]);
  const [overlaySize, setOverlaySize] = useState(100);
  const [overlayColor, setOverlayColor] = useState('#ffffff');
  const [overlayAlign, setOverlayAlign] = useState<TryxOverlayAlign>(DEFAULT_OVERLAY_ALIGN);
  const [overlayDocked, setOverlayDocked] = useState(DEFAULT_OVERLAY_DOCKED);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [previewHeightPx, setPreviewHeightPx] = useState(0);

  const [cropState, setCropState] = useState<{ src: string; file: File } | null>(null);
  const [uploading, setUploading] = useState(false);

  // Live monitoring sensor library backing the overlay's device/sensor
  // dropdowns and the preview's live values - independent of Tryx being
  // simulated (these are real hardware sensor topics either way).
  const sensors = useSensors(true);
  const usesNetworkSensor = overlayItems.some(item => item.device === 'network');
  const network = useNetworkMonitor(usesNetworkSensor);
  const networkSensors = buildNetworkSensors(network);
  const sensorsByGroup: TryxSensorsByGroup = {
    cpu: sensors.cpu,
    gpu: sensors.gpu,
    memory: sensors.memory,
    motherboard: sensors.motherboard,
    storage: sensors.storageSensors,
    network: networkSensors,
  };

  const aliveRef = useRef(true);
  const brightnessInteractingRef = useRef(false);
  const overlayInitRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewCanvasRef = useRef<HTMLDivElement | null>(null);
  const overlayPushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingOverlayRef = useRef<{
    items: TryxOverlayItem[]; font: string; size: number; color: string; align: TryxOverlayAlign; docked: boolean;
  } | null>(null);
  const dragRef = useRef<{ index: number; startPx: number; startPy: number; startX: number; startY: number } | null>(null);

  const refreshStatus = useCallback(async () => {
    const s = await getTryxStatus();
    if (!aliveRef.current) return;
    if (s) setStatus(s);
    setInitialLoading(false);
  }, []);

  const refreshPresets = useCallback(async () => {
    const p = await getTryxPresets();
    if (aliveRef.current) setPresets(p);
  }, []);

  const refreshMedia = useCallback(async () => {
    const m = await getTryxMedia();
    if (aliveRef.current) setMedia(m);
  }, []);

  const refreshCloudCatalog = useCallback(async () => {
    const items = await getTryxCloudCatalog();
    if (aliveRef.current) setCloudCatalog(items);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void refreshStatus();
    void refreshPresets();
    void refreshMedia();
    void refreshCloudCatalog();
    // Simulated device: the mock status is served once; no polling, so the
    // page's optimistic edits are never overwritten by a re-fetched snapshot.
    if (simulated) {
      return () => { aliveRef.current = false; };
    }
    const statusId = window.setInterval(() => { void refreshStatus(); }, STATUS_POLL_MS);
    const mediaId = window.setInterval(() => { void refreshMedia(); }, MEDIA_POLL_MS);
    const onFocus = () => { void refreshStatus(); void refreshPresets(); void refreshMedia(); };
    window.addEventListener('focus', onFocus);
    return () => {
      aliveRef.current = false;
      window.clearInterval(statusId);
      window.clearInterval(mediaId);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshStatus, refreshPresets, refreshMedia, refreshCloudCatalog, simulated]);

  // Local brightness wins while the user is dragging; otherwise it tracks the
  // polled state so opening the page shows the screen's real brightness.
  useEffect(() => {
    if (!brightnessInteractingRef.current && status?.state) {
      setBrightness(status.state.brightness);
    }
  }, [status?.state?.brightness, status?.state]);

  // Overlay local state seeds once from the first status payload, then the
  // user's edits are authoritative (each edit re-dispatches the full block).
  useEffect(() => {
    if (overlayInitRef.current || !status) return;
    overlayInitRef.current = true;
    const items = status.overlay?.items ?? [];
    const align = isTryxOverlayAlign(status.overlay?.align) ? status.overlay.align : DEFAULT_OVERLAY_ALIGN;
    setOverlayItems(OVERLAY_ITEM_SLOTS.map(i => {
      const item = items[i];
      const pos = dockedOverlayItemPosition(align, i);
      if (!item) {
        return { enabled: false, device: 'cpu', sensorId: '', label: '', sensorType: '', x: pos.x, y: pos.y };
      }
      return {
        enabled: true,
        device: isTryxSensorGroup(item.device) ? item.device : 'cpu',
        sensorId: item.sensorId,
        label: item.label,
        sensorType: '',
        x: clampUnit(item.x),
        y: clampUnit(item.y),
      };
    }));
    setOverlayFont(status.overlay?.font ?? TRYX_FONTS[0]);
    setOverlaySize(status.overlay?.size ?? 100);
    setOverlayColor(status.overlay?.color ?? '#ffffff');
    setOverlayAlign(align);
    setOverlayDocked(status.overlay?.docked ?? DEFAULT_OVERLAY_DOCKED);
  }, [status]);

  // Live sensor lists arrive after the status seed. Replace any stored sensorId
  // this machine doesn't actually have - a config saved on other hardware, or
  // the simulator's canned ids - with the group's first real sensor, so the
  // dropdown selects it and the preview shows a live value instead of "--".
  // Idempotent: only ever rewrites an item whose current sensorId is invalid.
  // Count of enabled items whose stored sensorId isn't valid for the currently
  // available sensors (empty, or a config saved on other hardware, or the
  // simulator's canned ids). Keying the reconcile effect on this - rather than
  // just the sensor counts - fires it whenever either the items OR the sensors
  // change into a fixable state, regardless of which arrives first.
  const overlayItemsNeedingSensor = overlayItems.filter(item => {
    if (!item.enabled) return false;
    const options = tryxSensorOptionsForGroup(item.device, sensorsByGroup);
    return options.length > 0 && !options.some(o => o.value === item.sensorId);
  }).length;
  useEffect(() => {
    if (overlayItemsNeedingSensor === 0) return;
    setOverlayItems(prev => prev.map(item => {
      if (!item.enabled) return item;
      const options = tryxSensorOptionsForGroup(item.device, sensorsByGroup);
      if (options.length === 0 || options.some(o => o.value === item.sensorId)) return item;
      const first = options[0];
      return { ...item, sensorId: first.value, label: first.bareLabel, sensorType: first.type };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayItemsNeedingSensor]);

  // Measures the preview canvas's rendered height so scalePanelMetric can
  // convert the panel's fixed-height layout constants into preview px; the
  // canvas is CSS aspect-ratio: 2, so its height tracks the pane's
  // responsive width.
  useEffect(() => {
    const el = previewCanvasRef.current;
    if (!el) return;
    // Guard the 0 a pre-layout measurement can report; the canvas mounts only
    // after the loading skeleton clears, so re-run on initialLoading too or the
    // observer is set up while the ref is still null and height stays 0.
    const update = () => {
      const h = el.getBoundingClientRect().height;
      if (h > 0) setPreviewHeightPx(h);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tab, initialLoading]);

  // Flushes a pending debounced overlay push immediately instead of
  // discarding it, so navigating away right after an edit still persists it.
  useEffect(() => () => {
    if (overlayPushTimerRef.current) clearTimeout(overlayPushTimerRef.current);
    if (pendingOverlayRef.current) void setTryxOverlay(pendingOverlayRef.current);
  }, []);

  // Debounced push of the full overlay block - every item/font/size/color/
  // align/docked/drag edit calls this so a fast drag coalesces into one
  // request instead of spamming the service on every pointermove.
  const pushOverlay = useCallback((
    items: OverlayItemState[], font: string, size: number, color: string, align: TryxOverlayAlign, docked: boolean,
  ) => {
    const wireItems: TryxOverlayItem[] = items
      .filter(i => i.enabled && i.sensorId)
      .map(i => ({ sensorId: i.sensorId, device: i.device, label: i.label, x: i.x, y: i.y }));
    pendingOverlayRef.current = { items: wireItems, font, size, color, align, docked };
    if (overlayPushTimerRef.current) clearTimeout(overlayPushTimerRef.current);
    overlayPushTimerRef.current = setTimeout(() => {
      overlayPushTimerRef.current = null;
      const pending = pendingOverlayRef.current;
      pendingOverlayRef.current = null;
      if (pending) void setTryxOverlay(pending);
    }, OVERLAY_PUSH_DEBOUNCE_MS);
  }, []);

  // Commits a new items/docked/align combination to state and dispatches it.
  // Align always drives text justification; docked only decides whether
  // positions are auto-derived from align or free to drag - callers resolve
  // that distinction before calling in (see the handlers below).
  const commitOverlay = useCallback((items: OverlayItemState[], docked: boolean, align: TryxOverlayAlign) => {
    setOverlayItems(items);
    setOverlayDocked(docked);
    setOverlayAlign(align);
    pushOverlay(items, overlayFont, overlaySize, overlayColor, align, docked);
  }, [pushOverlay, overlayFont, overlaySize, overlayColor]);

  const connected = !!status?.connected;
  // Optimistic screen toggle wins until the poll confirms it.
  const screenEnabled = screenOverride ?? (status?.state?.screenEnabled ?? true);
  useEffect(() => {
    if (screenOverride != null && status?.state?.screenEnabled === screenOverride) setScreenOverride(null);
  }, [status?.state?.screenEnabled, screenOverride]);
  const reportedMedia = status?.state?.currentMedia ?? '';
  // Optimistic pick wins until the cooler confirms it; reported value drives
  // otherwise, so opening the page shows whatever is currently on the screen.
  const currentMedia = selectedMedia ?? reportedMedia;

  useEffect(() => {
    if (selectedMedia && reportedMedia === selectedMedia) setSelectedMedia(null);
  }, [reportedMedia, selectedMedia]);

  // Release the optimistic preset pin once the cooler reports it, so a later
  // change from another client is reflected instead of the stale pin. Uses the
  // same predicate as the derived highlight below.
  const reportedCustom = status?.state?.currentMediaIsCustom ?? false;
  useEffect(() => {
    if (selectedPreset && !reportedCustom
      && (selectedPreset === reportedMedia || reportedMedia.startsWith(`${selectedPreset}.`))) {
      setSelectedPreset(null);
    }
  }, [reportedMedia, reportedCustom, selectedPreset]);

  // Highlighted preset: optimistic pick wins; otherwise derive from the
  // cooler's reported non-custom selection. The cooler reports the full media
  // filename (default_03.mp4.h264_2240x1080) while preset ids are the bare
  // default_NN, so match on the id prefix.
  const activePreset = selectedPreset
    ?? (!reportedCustom
      ? (presets.find(p => p.id === reportedMedia || reportedMedia.startsWith(`${p.id}.`))?.id ?? null)
      : null);

  // Same derivation as activePreset above, applied to the cloud catalog: an
  // installed material's preset id is `download_${id}`, which never appears in
  // `presets`, so it needs its own reportedMedia match against cloudCatalog.
  const activeCloudMaterialId = selectedPreset
    ? (selectedPreset.startsWith('download_') ? Number(selectedPreset.slice('download_'.length)) : null)
    : (!reportedCustom
      ? (cloudCatalog.find(m => {
        const id = `download_${m.id}`;
        return reportedMedia === id || reportedMedia.startsWith(`${id}.`);
      })?.id ?? null)
      : null);

  // Preview background: whichever wallpaper the media grid below highlights
  // as active (custom item, built-in preset, or installed cloud material,
  // in that precedence), reusing the exact same `active` predicates.
  const previewThumbUrl = media.find(m => m.name === currentMedia)?.thumb
    ?? (activePreset ? presets.find(p => p.id === activePreset)?.thumb : undefined)
    ?? (activeCloudMaterialId != null ? cloudCatalog.find(m => m.id === activeCloudMaterialId)?.coverUrl : undefined)
    ?? null;

  const getCanvasPercent = (e: { clientX: number; clientY: number }) => {
    const rect = previewCanvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  };

  const handleItemEnabledChange = (i: number, enabled: boolean) => {
    let toggled = overlayItems.map((it, idx) => (idx === i ? { ...it, enabled } : it));
    // A slot enabled for the first time has no sensor picked yet (device
    // defaults to cpu, sensorId ''); seed it from that device's first sensor
    // so an unconfigured stat never reaches pushOverlay with a blank sensorId.
    if (enabled && !toggled[i].sensorId) {
      const first = tryxSensorOptionsForGroup(toggled[i].device, sensorsByGroup)[0];
      if (first) {
        toggled = toggled.map((it, idx) => (idx === i
          ? { ...it, sensorId: first.value, label: first.bareLabel, sensorType: first.type }
          : it));
      }
    }
    const next = overlayDocked ? applyDockedOverlayLayout(toggled, overlayAlign) : toggled;
    commitOverlay(next, overlayDocked, overlayAlign);
  };

  const handleItemDeviceChange = (i: number, device: TryxSensorGroup) => {
    const first = tryxSensorOptionsForGroup(device, sensorsByGroup)[0];
    // No sensor available for the target group (also disabled in the
    // dropdown - see deviceGroupOptions): keep the current pick rather than
    // switching to a device/sensor pair the service can't render.
    if (!first) return;
    const next = overlayItems.map((it, idx) => (idx === i
      ? { ...it, device, sensorId: first.value, label: first.bareLabel, sensorType: first.type }
      : it));
    commitOverlay(next, overlayDocked, overlayAlign);
  };

  const handleItemSensorChange = (i: number, sensorId: string) => {
    const options = tryxSensorOptionsForGroup(overlayItems[i].device, sensorsByGroup);
    const picked = options.find(o => o.value === sensorId);
    const next = overlayItems.map((it, idx) => (idx === i
      ? { ...it, sensorId, label: picked?.bareLabel ?? it.label, sensorType: picked?.type ?? it.sensorType }
      : it));
    commitOverlay(next, overlayDocked, overlayAlign);
  };

  const handleAlignChange = (align: TryxOverlayAlign) => {
    const next = overlayDocked ? applyDockedOverlayLayout(overlayItems, align) : overlayItems;
    commitOverlay(next, overlayDocked, align);
  };

  const handleDockedChange = (docked: boolean) => {
    const next = docked ? applyDockedOverlayLayout(overlayItems, overlayAlign) : overlayItems;
    commitOverlay(next, docked, overlayAlign);
  };

  const handleStatPointerDown = (index: number, e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = getCanvasPercent(e);
    dragRef.current = { index, startPx: p.x, startPy: p.y, startX: overlayItems[index].x, startY: overlayItems[index].y };
    setDraggingIndex(index);
  };

  const handleStatPointerMove = (index: number, e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.index !== index) return;
    const p = getCanvasPercent(e);
    const nx = clampUnit(drag.startX + (p.x - drag.startPx));
    const ny = clampUnit(drag.startY + (p.y - drag.startPy));
    const next = overlayItems.map((it, i) => (i === index ? { ...it, x: nx, y: ny } : it));
    commitOverlay(next, false, overlayAlign);
  };

  const handleStatPointerEnd = () => {
    dragRef.current = null;
    setDraggingIndex(null);
  };

  const handleStatKeyDown = (index: number, e: KeyboardEvent<HTMLDivElement>) => {
    let dx = 0, dy = 0;
    switch (e.key) {
      case 'ArrowLeft': dx = -OVERLAY_KEYBOARD_STEP; break;
      case 'ArrowRight': dx = OVERLAY_KEYBOARD_STEP; break;
      case 'ArrowUp': dy = -OVERLAY_KEYBOARD_STEP; break;
      case 'ArrowDown': dy = OVERLAY_KEYBOARD_STEP; break;
      default: return;
    }
    e.preventDefault();
    const next = overlayItems.map((it, i) => (i === index
      ? { ...it, x: clampUnit(it.x + dx), y: clampUnit(it.y + dy) }
      : it));
    commitOverlay(next, false, overlayAlign);
  };

  const handleCloudInstall = useCallback((id: number) => {
    if (cloudInstallingId != null) return;
    setCloudInstallError(null);
    setCloudInstallingId(id);
    void (async () => {
      const result = await installTryxCloudMaterial(id);
      if (!aliveRef.current) return;
      setCloudInstallingId(null);
      if (result.ok) {
        await refreshCloudCatalog();
        await refreshPresets();
      } else {
        setCloudInstallError({ id, msg: result.msg || t('devices.tryx.cloudInstallFailed') });
      }
    })();
  }, [cloudInstallingId, refreshCloudCatalog, refreshPresets, t]);

  const handleCloudSelect = useCallback((materialId: number) => {
    const presetId = `download_${materialId}`;
    setSelectedPreset(presetId);
    setSelectedMedia(null);
    void setTryxPreset(presetId).then(ok => {
      if (!ok) setSelectedPreset(cur => (cur === presetId ? null : cur));
    });
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setCropState({ src: URL.createObjectURL(file), file });
  };

  const handleCropConfirm = useCallback((crop: NormalizedCrop) => {
    if (!cropState) return;
    const { file, src } = cropState;
    setCropState(null);
    setUploading(true);
    void (async () => {
      try {
        await uploadTryxMedia(file, crop);
        await refreshMedia();
      } finally {
        URL.revokeObjectURL(src);
        if (aliveRef.current) setUploading(false);
      }
    })();
  }, [cropState, refreshMedia]);

  const handleCropCancel = useCallback(() => {
    if (cropState) URL.revokeObjectURL(cropState.src);
    setCropState(null);
  }, [cropState]);

  if (initialLoading && !status) {
    return (
      <div className={styles.page}>
        {/* eslint-disable-next-line i18next/no-literal-string -- brand name */}
        <ViewHeader title="Tryx" />
        <div className={`${styles.pageBody} pageBody`}>
          <div className={styles.loadingWrap}>
            <Spinner size={28} />
          </div>
        </div>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className={styles.page}>
        {/* eslint-disable-next-line i18next/no-literal-string -- brand name */}
        <ViewHeader title="Tryx" />
        <div className={`${styles.pageBody} pageBody`}>
          <EmptyState
            icon={<MonitorOff size={40} />}
            title={t('devices.tryx.notDetected')}
            hint={t('devices.tryx.notDetectedHint')}
          />
        </div>
      </div>
    );
  }

  const TABS = [
    { key: 'display', label: t('devices.tryx.tabDisplay'), icon: <Monitor size={14} /> },
    { key: 'media', label: t('devices.tryx.tabMedia'), icon: <Film size={14} /> },
    { key: 'cooling', label: t('devices.tryx.tabCooling'), icon: <Wind size={14} /> },
  ];

  const fontOptions = TRYX_FONTS.map(font => ({ value: font, label: t(TRYX_FONT_LABEL_KEYS[font]) }));
  // A group with no sensors currently reporting (no GPU, storage/network not
  // wired yet, ...) is disabled rather than selectable-but-empty.
  const deviceGroupOptions = TRYX_SENSOR_GROUPS.map(group => ({
    value: group,
    label: t(TRYX_SENSOR_GROUP_LABEL_KEYS[group]),
    disabled: tryxSensorOptionsForGroup(group, sensorsByGroup).length === 0,
  }));
  const alignOptions = TRYX_OVERLAY_ALIGNS.map(align => ({ key: align, label: t(TRYX_OVERLAY_ALIGN_LABEL_KEYS[align]) }));

  return (
    <div className={styles.page}>
      <ViewHeader
        // eslint-disable-next-line i18next/no-literal-string -- brand name
        title="Tryx"
        tabs={TABS}
        activeTab={tab}
        onTabChange={k => setTab(k as TryxTab)}
        actions={uploading ? <span className={styles.savingBadge}>{t('devices.tryx.uploading')}</span> : null}
      />
      <div className={`${styles.pageBody} pageBody`}>
        <div className={styles.content}>
          {tab === 'display' && (
            <>
              <SettingsSection title={t('devices.tryx.screenSection')} boxClassName={styles.sectionBox}>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>{t('devices.tryx.screenOn')}</span>
                  <Toggle
                    checked={screenEnabled}
                    onChange={enabled => {
                      setScreenOverride(enabled);
                      void setTryxEnabled(enabled).then(ok => {
                        if (!ok) setScreenOverride(cur => (cur === enabled ? null : cur));
                      });
                    }}
                    ariaLabel={t('devices.tryx.screenOn')}
                  />
                </div>
                <div className={styles.sliderBlock}>
                  <Slider
                    // eslint-disable-next-line i18next/no-literal-string -- slider layout enum
                    orientation="stacked"
                    editable
                    trackFill
                    label={t('devices.tryx.brightness')}
                    value={brightness}
                    min={0}
                    max={100}
                    step={1}
                    formatValue={v => `${v}%`}
                    ariaLabel={t('devices.tryx.brightness')}
                    disabled={!screenEnabled}
                    onChange={(v, commit) => {
                      const rounded = Math.round(v);
                      if (commit) {
                        brightnessInteractingRef.current = false;
                        setBrightness(rounded);
                        void setTryxBrightness(rounded);
                        return;
                      }
                      brightnessInteractingRef.current = true;
                      setBrightness(rounded);
                    }}
                    onCommit={v => {
                      brightnessInteractingRef.current = false;
                      const rounded = Math.round(v);
                      setBrightness(rounded);
                      void setTryxBrightness(rounded);
                    }}
                  />
                </div>
              </SettingsSection>

              <SettingsSection title={t('devices.tryx.overlaySection')} boxClassName={styles.sectionBox}>
                {OVERLAY_ITEM_SLOTS.map(i => (
                  <div key={i} className={styles.overlayRow}>
                    <Toggle
                      checked={overlayItems[i].enabled}
                      onChange={enabled => handleItemEnabledChange(i, enabled)}
                      ariaLabel={t('devices.tryx.overlayLineAria', { n: i + 1 })}
                    />
                    <Select
                      className={styles.overlayDeviceSelect}
                      value={overlayItems[i].device}
                      options={deviceGroupOptions}
                      disabled={!overlayItems[i].enabled}
                      onChange={device => handleItemDeviceChange(i, device as TryxSensorGroup)}
                      ariaLabel={t('devices.tryx.overlayDeviceAria', { n: i + 1 })}
                    />
                    <Select
                      className={styles.overlaySelect}
                      value={overlayItems[i].sensorId}
                      options={tryxSensorOptionsForGroup(overlayItems[i].device, sensorsByGroup)
                        .map(o => ({ value: o.value, label: o.optionLabel }))}
                      disabled={!overlayItems[i].enabled}
                      onChange={sensorId => handleItemSensorChange(i, sensorId)}
                      ariaLabel={t('devices.tryx.overlaySensorAria', { n: i + 1 })}
                    />
                  </div>
                ))}
                <div className={styles.controlRow}>
                  <span className={styles.controlRowLabel}>{t('devices.tryx.align')}</span>
                  <ChipGroup
                    ariaLabel={t('devices.tryx.align')}
                    activeKey={overlayAlign}
                    onChange={align => handleAlignChange(align as TryxOverlayAlign)}
                    options={alignOptions}
                  />
                </div>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>{t('devices.tryx.docked')}</span>
                  <Toggle
                    checked={overlayDocked}
                    onChange={handleDockedChange}
                    ariaLabel={t('devices.tryx.docked')}
                  />
                </div>
                <div className={styles.controlRow}>
                  <span className={styles.controlRowLabel}>{t('devices.tryx.font')}</span>
                  <Select
                    className={styles.fontSelect}
                    value={overlayFont}
                    options={fontOptions}
                    onChange={font => {
                      setOverlayFont(font);
                      pushOverlay(overlayItems, font, overlaySize, overlayColor, overlayAlign, overlayDocked);
                    }}
                    ariaLabel={t('devices.tryx.font')}
                  />
                </div>
                <div className={styles.sliderBlock}>
                  <Slider
                    // eslint-disable-next-line i18next/no-literal-string -- slider layout enum
                    orientation="stacked"
                    editable
                    trackFill
                    label={t('devices.tryx.size')}
                    value={overlaySize}
                    min={50}
                    max={150}
                    step={1}
                    formatValue={v => `${v}%`}
                    ariaLabel={t('devices.tryx.size')}
                    onChange={v => {
                      const rounded = Math.round(v);
                      setOverlaySize(rounded);
                      pushOverlay(overlayItems, overlayFont, rounded, overlayColor, overlayAlign, overlayDocked);
                    }}
                    onCommit={v => {
                      const rounded = Math.round(v);
                      setOverlaySize(rounded);
                      pushOverlay(overlayItems, overlayFont, rounded, overlayColor, overlayAlign, overlayDocked);
                    }}
                  />
                </div>
                <div className={styles.colorSection}>
                  <span className={styles.controlRowLabel}>{t('devices.tryx.color')}</span>
                  <div className={styles.colorPicker}>
                    <HsvPicker
                      value={overlayColor}
                      onPreview={color => {
                        setOverlayColor(color);
                        pushOverlay(overlayItems, overlayFont, overlaySize, color, overlayAlign, overlayDocked);
                      }}
                      onCommit={color => {
                        setOverlayColor(color);
                        pushOverlay(overlayItems, overlayFont, overlaySize, color, overlayAlign, overlayDocked);
                      }}
                    />
                  </div>
                </div>
              </SettingsSection>
            </>
          )}

          {tab === 'media' && (
            <>
              <SettingsSection title={t('devices.tryx.presetsSection')} boxClassName={styles.sectionBox}>
                <div className={styles.mediaGrid}>
                  {/* Built-in presets */}
                  {presets.map(p => (
                    <EffectCard
                      key={`preset-${p.id}`}
                      asDiv
                      label={p.name}
                      thumbUrl={p.thumb ?? null}
                      thumbStatic
                      thumbAspect={2}
                      active={activePreset === p.id}
                      onClick={() => {
                        setSelectedPreset(p.id);
                        setSelectedMedia(null);
                        // Drop the optimistic pin if the cooler rejects it.
                        void setTryxPreset(p.id).then(ok => {
                          if (!ok) setSelectedPreset(cur => (cur === p.id ? null : cur));
                        });
                      }}
                    />
                  ))}

                  {/* Cloud themes (download on click if not installed) */}
                  {cloudCatalog.map(material => {
                    const isInstalling = cloudInstallingId === material.id;
                    const error = cloudInstallError?.id === material.id ? cloudInstallError.msg : null;
                    return (
                      <EffectCard
                        key={`cloud-${material.id}`}
                        asDiv
                        label={material.name}
                        thumbUrl={material.coverUrl}
                        thumbStatic
                        thumbAspect={2}
                        active={material.id === activeCloudMaterialId}
                        meta={error ?? undefined}
                        thumbOverlay={
                          isInstalling
                            ? <span className={styles.mediaOverlay}><Spinner size={26} /></span>
                            : (!material.installed
                              ? (
                                <span className={styles.mediaOverlay} aria-label={t('devices.tryx.cloudDownload')}>
                                  <Download size={34} strokeWidth={2.5} />
                                </span>
                              )
                              : undefined)}
                        onClick={() => {
                          if (material.installed) handleCloudSelect(material.id);
                          else handleCloudInstall(material.id);
                        }}
                      />
                    );
                  })}
                </div>
              </SettingsSection>

              <SettingsSection title={t('devices.tryx.customSection')} boxClassName={styles.sectionBox}>
                <div className={styles.libraryBlock}>
                  <Button
                    size="sm"
                    tone="neutral"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploading ? t('devices.tryx.uploading') : t('devices.tryx.uploadVideo')}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    className={styles.hiddenInput}
                    onChange={handleFileChange}
                  />

                  {media.length > 0 ? (
                    <div className={styles.mediaGrid}>
                      {media.map(item => (
                        <EffectCard
                          key={`custom-${item.name}`}
                          asDiv
                          label={mediaDisplayName(item.name)}
                          thumbUrl={item.thumb ?? null}
                          thumbStatic
                          thumbAspect={2}
                          active={item.name === currentMedia}
                          onClick={() => {
                            setSelectedMedia(item.name);
                            setSelectedPreset(null);
                            void selectTryxMedia(item.name).then(ok => {
                              if (!ok) setSelectedMedia(cur => (cur === item.name ? null : cur));
                            });
                          }}
                          onDelete={() => setPendingDelete(item.name)}
                          deleteAriaLabel={t('devices.tryx.deleteMediaAria')}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={<Film size={28} />}
                      title={t('devices.tryx.noMedia')}
                      hint={t('devices.tryx.noMediaHint')}
                      compact
                    />
                  )}
                </div>
              </SettingsSection>

              <ConfirmModal
                open={pendingDelete != null}
                title={t('devices.tryx.deleteMediaTitle')}
                message={t('devices.tryx.deleteMediaMessage', { name: pendingDelete ?? '' })}
                confirmLabel={t('common.delete')}
                onCancel={() => setPendingDelete(null)}
                onConfirm={() => {
                  const name = pendingDelete;
                  setPendingDelete(null);
                  if (name) void deleteTryxMedia(name).then(() => refreshMedia());
                }}
              />
            </>
          )}

          {tab === 'cooling' && (
            <SettingsSection title={t('devices.tryx.fanCurveSection')} boxClassName={styles.sectionBox}>
              <div className={styles.fanModeRow}>
                <Button
                  size="sm"
                  tone={fanMode === 'smart' ? 'accent' : 'neutral'}
                  onClick={() => setFanMode('smart')}
                >
                  {t('devices.tryx.fanModeSmart')}
                </Button>
                <Button
                  size="sm"
                  tone={fanMode === 'fixed' ? 'accent' : 'neutral'}
                  onClick={() => setFanMode('fixed')}
                >
                  {t('devices.tryx.fanModeFixed')}
                </Button>
              </div>

              {fanMode === 'smart' && (
                <CurveGraph
                  points={fanCurve}
                  tempMin={0}
                  tempMax={100}
                  editable
                  onChange={points => {
                    setFanCurve(points);
                    void setTryxFan('smart', { curve: points.map(p => [p.temp, p.speed]) });
                  }}
                />
              )}

              {fanMode === 'fixed' && (
                <div className={styles.sliderBlock}>
                  <Slider
                    // eslint-disable-next-line i18next/no-literal-string -- slider layout enum
                    orientation="stacked"
                    editable
                    trackFill
                    label={t('devices.tryx.fanSpeed')}
                    value={fanFixed}
                    min={0}
                    max={100}
                    step={1}
                    formatValue={v => `${v}%`}
                    ariaLabel={t('devices.tryx.fanSpeed')}
                    onChange={(v, commit) => {
                      const rounded = Math.round(v);
                      setFanFixed(rounded);
                      if (commit) void setTryxFan('fixed', { fixed: rounded });
                    }}
                    onCommit={v => {
                      const rounded = Math.round(v);
                      setFanFixed(rounded);
                      void setTryxFan('fixed', { fixed: rounded });
                    }}
                  />
                </div>
              )}
            </SettingsSection>
          )}
        </div>

        {tab === 'display' && (
          <div className={styles.previewPane}>
            <div
              ref={previewCanvasRef}
              className={styles.previewCanvas}
              style={previewThumbUrl ? { backgroundImage: `url(${previewThumbUrl})` } : undefined}
            >
              {overlayItems.map((item, i) => {
                if (!item.enabled) return null;
                const value = tryxOverlayPreviewValue(item.device, item.sensorId, item.sensorType, sensorsByGroup);
                const fontStyle = tryxFontCssStyle(overlayFont);
                const justify = tryxOverlayJustifyStyle(overlayAlign);
                const valueFontPx = scalePanelMetric(TRYX_VALUE_FONT_PANEL_PX, overlaySize, previewHeightPx);
                const labelFontPx = scalePanelMetric(TRYX_LABEL_FONT_PANEL_PX, overlaySize, previewHeightPx);
                const labelTopPx = scalePanelMetric(TRYX_LABEL_OFFSET_PANEL_PX, overlaySize, previewHeightPx);
                return (
                  <div
                    key={i}
                    role="button"
                    tabIndex={0}
                    className={styles.previewStat}
                    style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%` }}
                    aria-label={t('devices.tryx.overlayDragAria', { stat: item.label })}
                    aria-pressed={draggingIndex === i}
                    onPointerDown={e => handleStatPointerDown(i, e)}
                    onPointerMove={e => handleStatPointerMove(i, e)}
                    onPointerUp={handleStatPointerEnd}
                    onPointerCancel={handleStatPointerEnd}
                    onKeyDown={e => handleStatKeyDown(i, e)}
                  >
                    <span
                      className={styles.previewValue}
                      style={{ ...fontStyle, ...justify, fontSize: `${valueFontPx}px`, color: overlayColor }}
                    >
                      {value}
                    </span>
                    <span
                      className={styles.previewLabel}
                      style={{ ...fontStyle, ...justify, fontSize: `${labelFontPx}px`, top: `${labelTopPx}px`, color: overlayColor }}
                    >
                      {item.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {cropState && (
        <MediaCropper
          src={cropState.src}
          kind="video"
          aspect={UPLOAD_ASPECT}
          busy={uploading}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
    </div>
  );
}

export default TryxDevicePage;
