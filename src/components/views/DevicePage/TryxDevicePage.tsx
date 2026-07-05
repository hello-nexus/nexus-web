import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Monitor, MonitorOff, Film, Download } from 'lucide-react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { Spinner } from '../../common/Spinner/Spinner';
import { Select } from '../../common/Select/Select';
import { SettingRow, SettingSelect, SettingSlider, SettingToggle } from '../../common/SettingRow/SettingRow';
import { Toggle } from '../../common/Toggle/Toggle';
import { UsageBar } from '../../common/UsageBar/UsageBar';
import { Button } from '../../common/Button/Button';
import { ChipGroup } from '../../common/ChipGroup/ChipGroup';
import { HsvPicker } from '../../common/HsvPicker/HsvPicker';
import { EffectCard } from '../../common/EffectCard/EffectCard';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { MediaCropper, type NormalizedCrop } from '../../common/MediaCropper/MediaCropper';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { useSensors } from '../../../hooks/useSensors';
import { useNetworkMonitor } from '../../../hooks/useNetworkMonitor';
import { useFpsSensors } from '../../../hooks/useFpsSensors';
import { buildNetworkSensors } from '../../../panel/widgets/monitoring/networkSensors';
import { sensorsForCategory } from '../../../panel/widgets/monitoring/sensorCategories';
import {
  getTryxStatus,
  getTryxPresets,
  getTryxMedia,
  getTryxCloudCatalog,
  installTryxCloudMaterial,
  setTryxEnabled,
  setTryxBrightness,
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
  type TryxCloudMaterial,
  type TryxOverlayItem,
} from '../../../api/tryx';
import {
  applyDockedOverlayLayout,
  dockedOverlayItemPosition,
  clampUnit,
  formatTryxStorageFreePercent,
  isTryxOverlayAlign,
  isTryxSensorGroup,
  scalePanelMetric,
  tryxFontCssStyle,
  tryxOverlayJustifyStyle,
  tryxOverlayPreviewValue,
  tryxSensorOptionsForGroup,
  tryxStorageFreePercent,
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

// Fallback thumbnail for a device file we have no local frame for (a clip uploaded
// via another tool): a muted play glyph so the card reads as a video, not a blank.
const TRYX_MEDIA_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 48'%3E%3Crect width='96' height='48' fill='%23808890' opacity='0.10'/%3E%3Ccircle cx='48' cy='24' r='10' fill='none' stroke='%23808890' stroke-width='2' opacity='0.55'/%3E%3Cpath d='M44.5 19 L44.5 29 L53 24 Z' fill='%23808890' opacity='0.55'/%3E%3C/svg%3E";

// Custom uploads carry the on-device filename (stem + ".mp4.h264_2240x1080");
// show just the stem in the library.
const mediaDisplayName = (deviceName: string): string => deviceName.split('.mp4')[0] || deviceName;

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

const DEFAULT_OVERLAY_ITEMS: OverlayItemState[] = applyDockedOverlayLayout(
  OVERLAY_ITEM_SLOTS.map(i => ({
    enabled: i === 0,
    device: 'quick' as TryxSensorGroup,
    sensorId: '',
    label: '',
    sensorType: '',
    // Staggered per-slot seed so a slot enabled while UNDOCKED lands somewhere
    // sensible, not at the panel origin; applyDockedOverlayLayout re-centers the
    // enabled subset below.
    ...dockedOverlayItemPosition(DEFAULT_OVERLAY_ALIGN, i, OVERLAY_ITEM_SLOTS.length),
  })),
  DEFAULT_OVERLAY_ALIGN,
);

type TryxTab = 'display' | 'media';

/**
 * Native first-party page for the Tryx Panorama AIO screen (Display / Media),
 * driving the `/tryx/*` routes.
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
  const usesFpsSensor = overlayItems.some(item => item.device === 'fps');
  const network = useNetworkMonitor(usesNetworkSensor);
  const networkSensors = buildNetworkSensors(network);
  const fpsSensors = useFpsSensors(usesFpsSensor);
  const sensorsByGroup: TryxSensorsByGroup = {
    quick: sensorsForCategory('quick', sensors, networkSensors, fpsSensors),
    cpu: sensorsForCategory('cpu', sensors, networkSensors, fpsSensors),
    gpu: sensorsForCategory('gpu', sensors, networkSensors, fpsSensors),
    memory: sensorsForCategory('memory', sensors, networkSensors, fpsSensors),
    motherboard: sensorsForCategory('motherboard', sensors, networkSensors, fpsSensors),
    storage: sensorsForCategory('storage', sensors, networkSensors, fpsSensors),
    network: sensorsForCategory('network', sensors, networkSensors, fpsSensors),
    fps: sensorsForCategory('fps', sensors, networkSensors, fpsSensors),
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
    const docked = status.overlay?.docked ?? DEFAULT_OVERLAY_DOCKED;
    const built = OVERLAY_ITEM_SLOTS.map(i => {
      const item = items[i];
      if (!item) {
        // Staggered seed (see DEFAULT_OVERLAY_ITEMS) so enabling this slot while
        // undocked lands it somewhere sensible, not at the panel origin.
        const pos = dockedOverlayItemPosition(align, i, OVERLAY_ITEM_SLOTS.length);
        return { enabled: false, device: 'cpu' as TryxSensorGroup, sensorId: '', label: '', sensorType: '', x: pos.x, y: pos.y };
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
    });
    // Recompute a docked stack from the enabled count so an old top-aligned config
    // recenters; free (undocked) layouts keep their saved drag positions.
    setOverlayItems(docked ? applyDockedOverlayLayout(built, align) : built);
    setOverlayFont(status.overlay?.font ?? TRYX_FONTS[0]);
    setOverlaySize(status.overlay?.size ?? 100);
    setOverlayColor(status.overlay?.color ?? '#ffffff');
    setOverlayAlign(align);
    setOverlayDocked(docked);
  }, [status]);

  // Live sensor lists arrive after the status seed. Replace any stored sensorId
  // this machine doesn't actually have - a config saved on other hardware, or
  // the simulator's canned ids - with the group's first real sensor, so the
  // dropdown selects it and the preview shows a live value instead of "--".
  // Idempotent: only ever rewrites an item whose current sensorId is invalid.
  // Count of enabled items that need reconciling: either the stored sensorId
  // isn't valid for the currently available sensors (a config saved on other
  // hardware, or the simulator's canned ids), or the label is stale - the panel
  // label is a non-editable snapshot of the sensor's "<Device> <Sensor>" name,
  // so it must track the current prefixedLabel. Keying the effect on this count
  // fires it whenever items OR sensors change into a fixable state.
  const overlayItemsNeedingFix = overlayItems.filter(item => {
    if (!item.enabled) return false;
    const options = tryxSensorOptionsForGroup(item.device, sensorsByGroup);
    if (options.length === 0) return false;
    const opt = options.find(o => o.value === item.sensorId);
    return !opt || item.label !== opt.prefixedLabel;
  }).length;
  useEffect(() => {
    if (overlayItemsNeedingFix === 0) return;
    setOverlayItems(prev => prev.map(item => {
      if (!item.enabled) return item;
      const options = tryxSensorOptionsForGroup(item.device, sensorsByGroup);
      if (options.length === 0) return item;
      const opt = options.find(o => o.value === item.sensorId);
      if (!opt) {
        const first = options[0];
        return { ...item, sensorId: first.value, label: first.prefixedLabel, sensorType: first.type };
      }
      if (item.label !== opt.prefixedLabel) return { ...item, label: opt.prefixedLabel, sensorType: opt.type };
      return item;
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayItemsNeedingFix]);

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
  const mediaUsedBytes = status?.mediaUsedBytes ?? 0;
  const storageUsedPercent = 100 - tryxStorageFreePercent(mediaUsedBytes);
  const hasEnabledOverlayItem = overlayItems.some(item => item.enabled);
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
    // A slot enabled for the first time has no sensor picked yet (sensorId
    // ''); seed it from its current device's first sensor so an unconfigured
    // stat never reaches pushOverlay with a blank sensorId.
    if (enabled && !toggled[i].sensorId) {
      const first = tryxSensorOptionsForGroup(toggled[i].device, sensorsByGroup)[0];
      if (first) {
        toggled = toggled.map((it, idx) => (idx === i
          ? { ...it, sensorId: first.value, label: first.prefixedLabel, sensorType: first.type }
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
      ? { ...it, device, sensorId: first.value, label: first.prefixedLabel, sensorType: first.type }
      : it));
    commitOverlay(next, overlayDocked, overlayAlign);
  };

  const handleItemSensorChange = (i: number, sensorId: string) => {
    const options = tryxSensorOptionsForGroup(overlayItems[i].device, sensorsByGroup);
    const picked = options.find(o => o.value === sensorId);
    const next = overlayItems.map((it, idx) => (idx === i
      ? { ...it, sensorId, label: picked?.prefixedLabel ?? it.label, sensorType: picked?.type ?? it.sensorType }
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
                <SettingToggle
                  label={t('devices.tryx.screenOn')}
                  checked={screenEnabled}
                  onChange={enabled => {
                    setScreenOverride(enabled);
                    void setTryxEnabled(enabled).then(ok => {
                      if (!ok) setScreenOverride(cur => (cur === enabled ? null : cur));
                    });
                  }}
                />
                <SettingSlider
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
                <SettingRow label={t('devices.tryx.align')}>
                  <ChipGroup
                    ariaLabel={t('devices.tryx.align')}
                    activeKey={overlayAlign}
                    onChange={align => handleAlignChange(align as TryxOverlayAlign)}
                    options={alignOptions}
                  />
                </SettingRow>
                <SettingToggle
                  label={t('devices.tryx.docked')}
                  description={t('devices.tryx.dockedHint')}
                  checked={overlayDocked}
                  onChange={handleDockedChange}
                />
                <SettingSelect
                  label={t('devices.tryx.font')}
                  value={overlayFont}
                  options={fontOptions}
                  onChange={font => {
                    setOverlayFont(font);
                    pushOverlay(overlayItems, font, overlaySize, overlayColor, overlayAlign, overlayDocked);
                  }}
                />
                <SettingSlider
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
                <SettingRow label={t('devices.tryx.color')} align="start">
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
                </SettingRow>
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
                  <div className={styles.libraryHeaderRow}>
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
                    <div className={styles.storageIndicator}>
                      <div className={styles.storageBar} aria-hidden="true">
                        <UsageBar value={storageUsedPercent / 100} />
                      </div>
                      <span className={styles.hintText}>
                        {t('devices.tryx.storageFree', { percent: formatTryxStorageFreePercent(mediaUsedBytes) })}
                      </span>
                    </div>
                  </div>

                  {media.length > 0 ? (
                    <div className={styles.mediaGrid}>
                      {media.map(item => (
                        <EffectCard
                          key={`custom-${item.name}`}
                          asDiv
                          label={item.label ?? mediaDisplayName(item.name)}
                          thumbUrl={item.thumb ?? TRYX_MEDIA_PLACEHOLDER}
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
        </div>

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
              // Overlay stats are draggable only on the Display tab, where the
              // docked toggle that a drag flips lives; on Media the canvas is a
              // read-only preview so browsing can't silently un-dock the layout.
              const editable = tab === 'display';
              return (
                <div
                  key={i}
                  role={editable ? 'button' : undefined}
                  tabIndex={editable ? 0 : undefined}
                  className={styles.previewStat}
                  style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%` }}
                  aria-label={editable ? t('devices.tryx.overlayDragAria', { stat: item.label }) : undefined}
                  aria-pressed={editable ? draggingIndex === i : undefined}
                  onPointerDown={editable ? e => handleStatPointerDown(i, e) : undefined}
                  onPointerMove={editable ? e => handleStatPointerMove(i, e) : undefined}
                  onPointerUp={editable ? handleStatPointerEnd : undefined}
                  onPointerCancel={editable ? handleStatPointerEnd : undefined}
                  onKeyDown={editable ? e => handleStatKeyDown(i, e) : undefined}
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
          {tab === 'display' && hasEnabledOverlayItem && (
            <span className={styles.dragHint}>{t('devices.tryx.overlayDragHint')}</span>
          )}
        </div>
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
