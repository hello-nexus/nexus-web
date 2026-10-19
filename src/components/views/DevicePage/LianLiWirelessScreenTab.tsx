import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MonitorOff, Image as ImageIcon, Film, Video, Gauge, Clock, Sparkles, MonitorSmartphone, Cast, Orbit,
} from 'lucide-react';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { ChipGroup, type ChipOption } from '../../common/ChipGroup/ChipGroup';
import { Select, type SelectOption } from '../../common/Select/Select';
import { SettingRow, SettingSelect, SettingSlider, SettingToggle } from '../../common/SettingRow/SettingRow';
import { HsvPicker } from '../../common/HsvPicker/HsvPicker';
import { Button } from '../../common/Button/Button';
import { EffectCard } from '../../common/EffectCard/EffectCard';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { MediaCropper, type NormalizedCrop } from '../../common/MediaCropper/MediaCropper';
import { KlipyPicker } from '../../common/KlipyPicker/KlipyPicker';
import { stageKlipy, type KlipyGif } from '../../../api/klipy';
import {
  cancelMediaStage, fetchStagedFile, mediaStagePreviewUrl, mediaStageRawUrl, stagePreviewFor,
} from '../../../api/mediaLibrary';
import {
  getLianLiWirelessScreens,
  getLianLiWirelessMedia,
  setLianLiWirelessScreenSettings,
  setLianLiWirelessScreenContent,
  importLianLiWirelessMedia,
  setLianLiWirelessScreenOrder,
  deleteLianLiWirelessMedia,
  type LianLiScreenApi,
  type LianLiWirelessScreen,
  type LianLiWirelessScreenContentType,
  type LianLiWirelessScreenContentExtra,
  type LianLiWirelessMediaItem,
  type LianLiWirelessMediaKind,
  type LianLiOverlay,
  type LianLiScreenSource,
} from '../../../api/lianli-wireless';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import { sharedValue } from './screenSelection';
import { captureLianLiFlexMedia, syncLianLiFlexScreens } from '../../../api/lianli-flex';
import { DEFAULT_SCREEN_SOURCE, LianLiScreenSourcePicker } from './LianLiScreenSourcePicker';
import { DEFAULT_OVERLAY, LianLiFlexAnimation2dPanel } from './LianLiFlexAnimation2dPanel';
import { LianLiFlexTemplatesSection } from './LianLiFlexTemplatesSection';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { localizeNumbers } from '../../../lib/units';
import { LianLiAioScreenSection } from './LianLiAioScreenSection';
import styles from './LianLiWirelessDevicePage.module.scss';

const WIRELESS_SCREEN_API: LianLiScreenApi = {
  getScreens: () => getLianLiWirelessScreens(),
  setSettings: (...args) => setLianLiWirelessScreenSettings(...args),
  setOrder: (...args) => setLianLiWirelessScreenOrder(...args),
  setContent: (...args) => setLianLiWirelessScreenContent(...args),
};

const SCREENS_POLL_MS = 2000;
// One poll interval plus margin: long enough that the poll following an edit's
// POST observes the applied server state before it resumes overwriting.
const EDIT_POLL_GRACE_MS = 2500;

// Screens without a saved order sort after every ordered one.
function orderKey(s: LianLiWirelessScreen): number {
  return s.order !== undefined && s.order >= 0 ? s.order : Number.MAX_SAFE_INTEGER;
}

// Picture, dynamic and video content share one picker entry; the stored type is the item's kind.
type ContentChoice = LianLiWirelessScreenContentType | 'media';

function isMediaType(type: LianLiWirelessScreenContentType): boolean {
  return type === 'image' || type === 'gif' || type === 'video';
}

function choiceOf(type: LianLiWirelessScreenContentType): ContentChoice {
  return isMediaType(type) ? 'media' : type;
}

const FLEX_CONTENT_TYPES: { value: ContentChoice; labelKey: string }[] = [
  { value: 'screen', labelKey: 'devices.lianli-flex.contentTypeScreen' },
  { value: 'animation2d', labelKey: 'devices.lianli-flex.contentTypeAnimation2d' },
];

const CAPTURE_MIN_SECONDS = 1;
const CAPTURE_MAX_SECONDS = 30;
const CAPTURE_DEFAULT_SECONDS = 5;

const CONTENT_TYPES: { value: ContentChoice; labelKey: string }[] = [
  { value: 'off', labelKey: 'devices.lianli-wireless.contentTypeOff' },
  { value: 'media', labelKey: 'devices.lianli-wireless.contentTypeMedia' },
  { value: 'sensor', labelKey: 'devices.lianli-wireless.contentTypeSensor' },
  { value: 'clock', labelKey: 'devices.lianli-wireless.contentTypeClock' },
  { value: 'animation', labelKey: 'devices.lianli-wireless.contentTypeAnimation' },
];

const ROTATIONS = [0, 1, 2, 3];

const SELECTION_MODES: { key: 'single' | 'multiple'; labelKey: string }[] = [
  { key: 'single', labelKey: 'devices.lianli-wireless.selectionModeSingle' },
  { key: 'multiple', labelKey: 'devices.lianli-wireless.selectionModeMultiple' },
];

const MEDIA_ACCEPT = 'image/jpeg,image/png,image/gif,video/mp4';

// The screen's media library is square, like the glass.
const UPLOAD_ASPECT = 1;

interface CropState {
  src: string;
  kind: 'video' | 'image';
  fallbackSrc?: string;
  name: string;
  /** A local pick carries its File; a Klipy pick is staged in the service and fetched from rawUrl on confirm. */
  file?: File;
  stageId?: string;
  rawUrl?: string;
}

function mediaKindIcon(kind: LianLiWirelessMediaKind) {
  if (kind === 'video') return <Video size={14} aria-hidden />;
  if (kind === 'gif') return <Film size={14} aria-hidden />;
  return <ImageIcon size={14} aria-hidden />;
}

function contentTypeIcon(type: LianLiWirelessScreenContentType) {
  switch (type) {
    case 'image': return <ImageIcon size={20} aria-hidden />;
    case 'gif': return <Film size={20} aria-hidden />;
    case 'video': return <Video size={20} aria-hidden />;
    case 'sensor': return <Gauge size={20} aria-hidden />;
    case 'clock': return <Clock size={20} aria-hidden />;
    case 'animation': return <Sparkles size={20} aria-hidden />;
    case 'screen': return <Cast size={20} aria-hidden />;
    case 'animation2d': return <Orbit size={20} aria-hidden />;
    default: return <MonitorOff size={20} aria-hidden />;
  }
}

/**
 * Screen tab: LCD content, brightness and rotation for the wireless SLV3-LCD
 * fan screens. Fans are selected by toggling their tiles; every edit is
 * broadcast to all selected fans, so selecting several edits them as a group.
 * Polls its own `/screens` list independently of the shell's fan-state poll.
 * Each bound HydroShift II adds its own screen section above the fan screens.
 */
export function LianLiWirelessScreenTab({
  aioMacs = [], usbMacs = [], panelOpener, api = WIRELESS_SCREEN_API,
  supportsBrightness = true, supportsSleepWhenLocked = true, onOpenScreenPanel, lcdRestart, flex = false,
}: {
  aioMacs?: string[];
  /** AIOs whose USB cable is connected, by MAC. */
  usbMacs?: string[];
  /** Opens an AIO's own panel page by MAC; undefined when it has none. */
  panelOpener?: (mac: string) => (() => void) | undefined;
  /** The screen endpoints of the device family; the wireless ones by default. */
  api?: LianLiScreenApi;
  /** False for a family whose screens have no backlight control. */
  supportsBrightness?: boolean;
  /** False for a family whose screens cannot sleep when the PC locks. */
  supportsSleepWhenLocked?: boolean;
  /** Opens the sidebar panel of a screen in panel mode, by its panel record id. */
  onOpenScreenPanel?: (panelDeviceId: string) => void;
  /** The wired LCD Flex screens: adds the live screen and 2D animation content, capture, sync to all and templates. */
  flex?: boolean;
  /** Restart LCD for families whose screens can be restarted; absent otherwise. */
  lcdRestart?: {
    isRestarting: (serial: string) => boolean;
    onRestart: (serial: string) => void;
  };
}) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const [screens, setScreens] = useState<LianLiWirelessScreen[] | null>(null);
  const [media, setMedia] = useState<LianLiWirelessMediaItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [selectionMode, setSelectionMode] = useState<'single' | 'multiple'>('single');
  const [brightnessDraft, setBrightnessDraft] = useState(50);
  // A drag in progress shows its own value even while the selected screens still differ.
  const [brightnessDragging, setBrightnessDragging] = useState(false);
  // "Media" chosen before any item: no content type is posted until an item is picked.
  const [mediaPending, setMediaPending] = useState(false);
  // 2D animation chosen before a sprite: nothing is posted until the sprite is picked.
  const [animation2dPending, setAnimation2dPending] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [captureSource, setCaptureSource] = useState<LianLiScreenSource>(DEFAULT_SCREEN_SOURCE);
  const [captureSeconds, setCaptureSeconds] = useState(CAPTURE_DEFAULT_SECONDS);
  const [captureFailed, setCaptureFailed] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cropState, setCropState] = useState<CropState | null>(null);
  const [klipyOpen, setKlipyOpen] = useState(false);
  const [klipyBusy, setKlipyBusy] = useState<string | null>(null);
  const [klipyError, setKlipyError] = useState<string | null>(null);
  const [pendingDeleteMedia, setPendingDeleteMedia] = useState<LianLiWirelessMediaItem | null>(null);

  const aliveRef = useRef(true);
  const brightnessInteractingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Suppress the poll's setScreens for a beat after any local edit so an
  // in-flight poll (fired before the edit's POST landed) can't snap an
  // optimistic value - a mid-drag color, a just-picked face - back to stale
  // server state before the service has applied it.
  const lastEditRef = useRef(Number.NEGATIVE_INFINITY);

  const refreshScreens = useCallback(async () => {
    const s = await api.getScreens();
    if (aliveRef.current && performance.now() - lastEditRef.current > EDIT_POLL_GRACE_MS) {
      setScreens(s);
    }
  }, [api]);

  const refreshMedia = useCallback(async () => {
    const m = await getLianLiWirelessMedia();
    if (aliveRef.current) setMedia(m);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void refreshScreens();
    void refreshMedia();
    const onFocus = () => { void refreshScreens(); void refreshMedia(); };
    window.addEventListener('focus', onFocus);
    const id = window.setInterval(() => { void refreshScreens(); }, SCREENS_POLL_MS);
    return () => {
      aliveRef.current = false;
      window.removeEventListener('focus', onFocus);
      window.clearInterval(id);
    };
  }, [refreshScreens, refreshMedia]);

  // The panel record appears a few seconds after a screen enters panel mode.
  useTopicCallback('panel/device', true, () => { void refreshScreens(); });

  const loaded = screens !== null;
  // Saved order first, then the firmware position; equal keys keep the
  // service's list order (Array.sort is stable).
  const orderedScreens = useMemo(
    () => (screens
      ? [...screens].sort((a, b) => orderKey(a) - orderKey(b) || a.position - b.position)
      : []),
    [screens],
  );

  // Select the first screen once the list first loads; after that the user's
  // toggles stand, including selecting none.
  const selectionInitedRef = useRef(false);
  useEffect(() => {
    if (!selectionInitedRef.current && orderedScreens.length > 0) {
      selectionInitedRef.current = true;
      setSelected(new Set([orderedScreens[0].serial]));
    }
  }, [orderedScreens]);

  // Swap the selected fan with its neighbour in the list and persist the
  // whole order; the optimistic local order holds until the next poll.
  const moveSelected = useCallback((delta: -1 | 1) => {
    if (!screens || selected.size !== 1) return;
    const [serial] = selected;
    const serials = orderedScreens.map(s => s.serial);
    const from = serials.indexOf(serial);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= serials.length) return;
    [serials[from], serials[to]] = [serials[to], serials[from]];
    lastEditRef.current = performance.now();
    setScreens(prev => prev ? prev.map(s => ({ ...s, order: serials.indexOf(s.serial) })) : prev);
    void api.setOrder(serials);
  }, [screens, selected, orderedScreens, api]);

  const toggleScreen = useCallback((serial: string) => {
    setMediaPending(false);
    setSelected(prev => {
      if (selectionMode === 'single') return new Set([serial]);
      const next = new Set(prev);
      if (next.has(serial)) next.delete(serial); else next.add(serial);
      return next;
    });
  }, [selectionMode]);

  const handleModeChange = useCallback((mode: string) => {
    setMediaPending(false);
    const next = mode === 'multiple' ? 'multiple' : 'single';
    setSelectionMode(next);
    if (next === 'single') {
      // Collapse a multi-selection down to the first selected fan.
      setSelected(prev => {
        const first = orderedScreens.find(s => prev.has(s.serial));
        return new Set(first ? [first.serial] : []);
      });
    }
  }, [orderedScreens]);

  // The screens a control edit applies to (the selected group); the FIRST one's
  // current value is the representative shown in the controls.
  const targetScreens = orderedScreens.filter(s => selected.has(s.serial));
  const selectedIndex = selected.size === 1 ? orderedScreens.findIndex(s => selected.has(s.serial)) : -1;
  const representative = targetScreens[0] ?? null;
  // A restarting screen can drop out of the screens list, so this reads the selection, not the list.
  const restarting = !!lcdRestart && [...selected].some(serial => lcdRestart.isRestarting(serial));
  // A control shows the shared value, or a mixed state when the selected screens differ.
  const brightness = sharedValue(targetScreens, s => s.brightness);
  const rotation = sharedValue(targetScreens, s => s.rotation);
  const sleep = sharedValue(targetScreens, s => s.sleepWhenLocked ?? true);
  const mixedLabel = t('common.mixed');
  const nexusPanel = sharedValue(targetScreens, s => s.nexusPanel === true);
  // When several fans with different content types are selected the content
  // controls can't show one truth; force a fresh pick instead.
  const sharedChoice = targetScreens.length > 0
    && targetScreens.every(s => choiceOf(s.contentType) === choiceOf(targetScreens[0].contentType))
    ? choiceOf(targetScreens[0].contentType)
    : null;
  const contentMixed = targetScreens.length > 0 && sharedChoice === null && !mediaPending && !animation2dPending;
  const showAnimation2d = animation2dPending || sharedChoice === 'animation2d';
  const showMedia = !animation2dPending && (mediaPending || sharedChoice === 'media');

  useEffect(() => {
    if (!brightnessInteractingRef.current && representative) {
      setBrightnessDraft(representative.brightness);
    }
  }, [representative?.brightness, representative]);

  const applyToTargets = useCallback((
    mutate: (s: LianLiWirelessScreen) => LianLiWirelessScreen,
    dispatch: (serial: string) => void,
  ) => {
    if (!screens) return;
    lastEditRef.current = performance.now();
    const serials = screens.filter(s => selected.has(s.serial)).map(s => s.serial);
    setScreens(prev => prev ? prev.map(s => (serials.includes(s.serial) ? mutate(s) : s)) : prev);
    for (const serial of serials) dispatch(serial);
  }, [screens, selected]);

  const commitBrightness = useCallback((v: number) => {
    brightnessInteractingRef.current = false;
    setBrightnessDragging(false);
    const rounded = Math.round(v);
    setBrightnessDraft(rounded);
    applyToTargets(
      s => ({ ...s, brightness: rounded }),
      serial => { void api.setSettings(serial, { brightness: rounded }); },
    );
  }, [applyToTargets, api]);

  const handleRotationChange = useCallback((rotation: number) => {
    applyToTargets(
      s => ({ ...s, rotation }),
      serial => { void api.setSettings(serial, { rotation }); },
    );
  }, [applyToTargets, api]);

  const handleSleepWhenLockedChange = useCallback((sleepWhenLocked: boolean) => {
    const previous = new Map(targetScreens.map(s => [s.serial, s.sleepWhenLocked]));
    applyToTargets(
      s => ({ ...s, sleepWhenLocked }),
      serial => {
        void api.setSettings(serial, { sleepWhenLocked }).then(ok => {
          if (ok) return;
          setScreens(prev => prev
            ? prev.map(s => (s.serial === serial ? { ...s, sleepWhenLocked: previous.get(serial) } : s))
            : prev);
        });
      },
    );
  }, [applyToTargets, targetScreens, api]);

  const handleNexusPanelChange = useCallback((nexusPanel: boolean) => {
    applyToTargets(
      s => ({ ...s, nexusPanel }),
      serial => { void api.setSettings(serial, { nexusPanel }); },
    );
  }, [applyToTargets, api]);

  const handleContentTypeChange = useCallback((choice: ContentChoice) => {
    if (choice === 'media') {
      setAnimation2dPending(false);
      setMediaPending(true);
      return;
    }
    if (choice === 'animation2d') {
      setMediaPending(false);
      setAnimation2dPending(true);
      return;
    }
    setMediaPending(false);
    setAnimation2dPending(false);
    const contentType = choice;
    applyToTargets(
      s => ({ ...s, contentType }),
      serial => { void api.setContent(serial, contentType); },
    );
  }, [applyToTargets, api]);

  const handleMediaSelect = useCallback((item: LianLiWirelessMediaItem) => {
    setMediaPending(false);
    setAnimation2dPending(false);
    applyToTargets(
      s => ({ ...s, contentType: item.kind, mediaId: item.id }),
      serial => { void api.setContent(serial, item.kind, item.id); },
    );
  }, [applyToTargets, api]);

  // Optimistic-only update for a color drag preview: mirrors the picker's
  // live value in the tile/target state without posting to the service.
  const previewContentField = useCallback((patch: Partial<LianLiWirelessScreen>) => {
    applyToTargets(s => ({ ...s, ...patch }), () => {});
  }, [applyToTargets]);

  const commitContentField = useCallback((
    contentType: LianLiWirelessScreenContentType,
    patch: LianLiWirelessScreenContentExtra,
  ) => {
    applyToTargets(
      s => ({ ...s, contentType, ...patch }),
      serial => { void api.setContent(serial, contentType, undefined, patch); },
    );
  }, [applyToTargets, api]);

  const handleOverlayCommit = useCallback((overlay: LianLiOverlay, backgroundMediaId: string | undefined) => {
    setAnimation2dPending(false);
    applyToTargets(
      s => ({ ...s, contentType: 'animation2d', overlay, mediaId: backgroundMediaId }),
      serial => { void api.setContent(serial, 'animation2d', backgroundMediaId, { overlay }); },
    );
  }, [applyToTargets, api]);

  const handleCapture = useCallback(async (mode: 'screenshot' | 'recording') => {
    setCapturing(true);
    setCaptureFailed(false);
    const item = await captureLianLiFlexMedia(mode === 'recording' ? { durationSeconds: captureSeconds, screenSource: captureSource } : { screenSource: captureSource }).catch(() => null);
    if (!aliveRef.current) return;
    setCapturing(false);
    if (!item) {
      setCaptureFailed(true);
      return;
    }
    await refreshMedia();
    if (aliveRef.current) handleMediaSelect(item);
  }, [captureSeconds, captureSource, refreshMedia, handleMediaSelect]);

  const handleSyncAll = useCallback(async (serial: string) => {
    setSyncFailed(false);
    const ok = await syncLianLiFlexScreens(serial).catch(() => false);
    if (!aliveRef.current) return;
    setSyncFailed(!ok);
    lastEditRef.current = Number.NEGATIVE_INFINITY;
    void refreshScreens();
  }, [refreshScreens]);

  const openUpload = useCallback(() => { fileInputRef.current?.click(); }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setCropState({
      src: URL.createObjectURL(file),
      kind: file.type.startsWith('video/') ? 'video' : 'image',
      name: file.name,
      file,
    });
  };

  const handleCropConfirm = useCallback(async (crop: NormalizedCrop) => {
    if (!cropState) return;
    const { file, src, name, stageId, rawUrl } = cropState;
    // Keep the cropper mounted + busy through the encode (gif/video transcode
    // is slow); it disables its own buttons and shows a converting overlay.
    // Close only once the import fully resolves.
    setUploading(true);
    try {
      const upload = file ?? (rawUrl ? await fetchStagedFile(rawUrl, name) : null);
      if (upload) {
        const item = await importLianLiWirelessMedia(upload, crop);
        await refreshMedia();
        if (item && aliveRef.current) handleMediaSelect(item);
      }
    } finally {
      if (file) URL.revokeObjectURL(src);
      if (stageId) cancelMediaStage(stageId).catch(() => {});
      if (aliveRef.current) {
        setUploading(false);
        setCropState(null);
      }
    }
  }, [cropState, refreshMedia, handleMediaSelect]);

  const handleCropCancel = useCallback(() => {
    if (cropState?.file) URL.revokeObjectURL(cropState.src);
    if (cropState?.stageId) cancelMediaStage(cropState.stageId).catch(() => {});
    setCropState(null);
  }, [cropState]);

  // A pick is staged in the service like the other Klipy surfaces and lands in the same cropper as a file.
  const handleKlipyPick = useCallback(async (gif: KlipyGif) => {
    setKlipyBusy(gif.slug);
    setKlipyError(null);
    const staged = await stageKlipy(gif.slug);
    if (!aliveRef.current) return;
    setKlipyBusy(null);
    if (!staged) {
      setKlipyError(t('lighting.controls.importNetworkError'));
      return;
    }
    // A refusal here is Klipy's (no file, no such clip, over the cap), not the service's.
    if (staged.error || !staged.stageId) {
      setKlipyError(t('lighting.controls.klipyPickFailed'));
      return;
    }
    setKlipyOpen(false);
    const rawUrl = mediaStageRawUrl(staged.stageId);
    setCropState({
      ...stagePreviewFor(staged.mediaKind, rawUrl, mediaStagePreviewUrl(staged.stageId)),
      name: `${gif.slug}.${staged.mediaKind === 'gif' ? 'gif' : 'mp4'}`,
      stageId: staged.stageId,
      rawUrl,
    });
  }, [t]);

  const contentTypeOptions: SelectOption[] = [...CONTENT_TYPES, ...(flex ? FLEX_CONTENT_TYPES : [])].map(ct => ({
    value: ct.value,
    label: t(ct.labelKey),
  }));

  // With only an AIO bound, the tab skips the fan screens' empty note and disabled controls.
  const fanScreens = !(loaded && orderedScreens.length === 0 && aioMacs.length > 0);

  return (
    <>
      {aioMacs.map(mac => (
        <LianLiAioScreenSection key={mac} mac={mac} usbConnected={usbMacs.includes(mac)} onOpenPanel={panelOpener?.(mac)} />
      ))}

      {fanScreens && <SettingsSection
        title={t('devices.lianli-wireless.selectionSection')}
        boxClassName={styles.sectionBox}
      >
        {!loaded && <p className={styles.emptyNote} data-settings-aside="true">{t('devices.lianli-wireless.loadingScreens')}</p>}
        {loaded && orderedScreens.length === 0 && (
          <p className={styles.emptyNote} data-settings-aside="true">{t('devices.lianli-wireless.noScreens')}</p>
        )}
        {orderedScreens.length > 0 && (
          <>
            <SettingRow label={t('devices.lianli-wireless.selectionModeLabel')}>
              <ChipGroup
                ariaLabel={t('devices.lianli-wireless.selectionModeLabel')}
                activeKey={selectionMode}
                onChange={handleModeChange}
                options={SELECTION_MODES.map(m => ({ key: m.key, label: t(m.labelKey) }))}
              />
            </SettingRow>
            {/* Icon tiles: each mirrors its screen's live content/brightness/
                rotation. In single mode a click selects that one fan; in multiple
                mode it toggles the fan in/out and edits apply to every selected
                fan. Numbered by list order (1-based) since GetPosIndex returns 0
                on this firmware. */}
            <div
              className={styles.screenPreviewGrid}
              role="group"
              aria-label={t('devices.lianli-wireless.screensAria')}
              data-settings-aside="true"
            >
              {orderedScreens.map((s, i) => {
                const active = selected.has(s.serial);
                return (
                  <button
                    key={s.serial}
                    type="button"
                    className={`${styles.screenPreviewTile} ${active ? styles.screenPreviewTileActive : ''}`}
                    aria-pressed={active}
                    onClick={() => toggleScreen(s.serial)}
                  >
                    <span
                      className={styles.screenPreviewThumb}
                      style={{ transform: `rotate(${s.rotation * 90}deg)`, opacity: 0.3 + (s.brightness / 100) * 0.7 }}
                    >
                      {contentTypeIcon(s.contentType)}
                    </span>
                    <span className={styles.screenPreviewLabel}>
                      {s.label || t('devices.lianli-wireless.fanN', { n: i + 1 })}
                    </span>
                  </button>
                );
              })}
            </div>
            {/* The user lines the tile numbers up with the physical fans here. */}
            <SettingRow label={t('devices.lianli-wireless.orderLabel')} disabled={selected.size !== 1}>
              <div className={styles.orderButtons}>
                <Button
                  size="sm"
                  tone="neutral"
                  disabled={selected.size !== 1 || selectedIndex <= 0}
                  onClick={() => moveSelected(-1)}
                >
                  {t('devices.lianli-wireless.orderMoveLeft')}
                </Button>
                <Button
                  size="sm"
                  tone="neutral"
                  disabled={selected.size !== 1 || selectedIndex < 0 || selectedIndex >= orderedScreens.length - 1}
                  onClick={() => moveSelected(1)}
                >
                  {t('devices.lianli-wireless.orderMoveRight')}
                </Button>
              </div>
            </SettingRow>
          </>
        )}
      </SettingsSection>}

      {fanScreens && <SettingsSection
        title={t('devices.lianli-wireless.displaySection')}
        boxClassName={styles.sectionBox}
      >
        {supportsBrightness && <SettingSlider
          editable
          trackFill
          label={t('devices.lianli-wireless.brightness')}
          value={brightnessDraft}
          min={0}
          max={100}
          step={1}
          formatValue={v => localizeNumbers(`${v}%`, numberFormat)}
          ariaLabel={t('devices.lianli-wireless.brightness')}
          disabled={!representative}
          mixed={brightness.mixed && !brightnessDragging}
          mixedLabel={mixedLabel}
          onChange={(v, commit) => {
            const rounded = Math.round(v);
            if (commit) { commitBrightness(rounded); return; }
            brightnessInteractingRef.current = true;
            setBrightnessDragging(true);
            setBrightnessDraft(rounded);
          }}
          onCommit={commitBrightness}
        />}
        <SettingRow label={t('devices.lianli-wireless.rotationLabel')} disabled={!representative}>
          <ChipGroup
            ariaLabel={t('devices.lianli-wireless.rotationLabel')}
            activeKey={rotation.mixed ? '' : String(rotation.value ?? 0)}
            partialKeys={rotation.mixed ? new Set([...rotation.held].map(String)) : undefined}
            partialLabel={mixedLabel}
            onChange={v => handleRotationChange(Number(v))}
            options={ROTATIONS.map(r => ({
              key: String(r),
              label: t('devices.lianli-wireless.rotationDegrees', { n: r * 90 }),
            }))}
          />
        </SettingRow>
        {lcdRestart && (
          <SettingRow
            label={t('devices.lianli-flex.restartLcd')}
            description={t('devices.lianli-flex.restartLcdHint')}
            disabled={!representative && !restarting}
          >
            <Button
              size="sm"
              tone="neutral"
              disabled={(!representative && !restarting) || restarting}
              onClick={() => targetScreens.forEach(s => lcdRestart.onRestart(s.serial))}
            >
              {restarting
                ? t('devices.lianli-flex.restartingLcd')
                : t('devices.lianli-flex.restartLcdButton')}
            </Button>
          </SettingRow>
        )}
        {supportsSleepWhenLocked && <SettingToggle
          label={t('devices.lcd.sleepWhenLocked')}
          checked={sleep.value ?? true}
          mixed={sleep.mixed}
          onChange={next => handleSleepWhenLockedChange(next)}
          disabled={!representative}
        />}
      </SettingsSection>}

      {fanScreens && <SettingsSection
        title={t('devices.lianli-wireless.contentSection')}
        boxClassName={styles.sectionBox}
      >
        <SettingToggle
          label={t('devices.lianli-wireless.nexusPanelUse')}
          description={t('devices.lianli-wireless.nexusPanelUseHint')}
          checked={nexusPanel.value ?? false}
          mixed={nexusPanel.mixed}
          onChange={handleNexusPanelChange}
          disabled={!representative}
        />
        {nexusPanel.value === true && targetScreens.length === 1 && (
          <div data-settings-aside="true">
            {representative?.panelDeviceId == null && (
              <p className={styles.emptyNote}>{t('devices.lianli-wireless.panelPending')}</p>
            )}
            <Button
              size="sm"
              tone="neutral"
              icon={<MonitorSmartphone size={14} />}
              disabled={representative?.panelDeviceId == null || !onOpenScreenPanel}
              onClick={() => { if (representative?.panelDeviceId) onOpenScreenPanel?.(representative.panelDeviceId); }}
            >
              {t('devices.lianli-wireless.openPanel')}
            </Button>
          </div>
        )}
        {/* While the panel owns the screen the content controls stay visible but locked. */}
        <SettingRow label={t('devices.lianli-wireless.contentTypeLabel')} disabled={!representative || nexusPanel.value === true}>
          <Select
            className={styles.contentTypeSelect}
            value={contentMixed ? '' : (showAnimation2d ? 'animation2d' : showMedia ? 'media' : (sharedChoice ?? 'off'))}
            placeholder={t('common.mixed')}
            options={contentTypeOptions}
            disabled={!representative || nexusPanel.value === true}
            onChange={v => handleContentTypeChange(v as ContentChoice)}
            ariaLabel={t('devices.lianli-wireless.contentTypeAria')}
          />
        </SettingRow>
        {contentMixed && (
          <p className={styles.emptyNote} data-settings-aside="true">{t('devices.lianli-wireless.contentMixedHint')}</p>
        )}

        {representative && !contentMixed && (
          <div data-settings-aside="true" className={nexusPanel.value === true ? styles.contentLocked : undefined} inert={nexusPanel.value === true}>
            {showMedia && (
              <MediaPanel
                media={media}
                // Different items across the selection leave no single tile current.
                currentMediaId={sharedChoice === 'media' && !sharedValue(targetScreens, s => s.mediaId ?? null).mixed
                  ? (representative.mediaId ?? null)
                  : null}
                uploading={uploading}
                onUploadClick={openUpload}
                onKlipyClick={() => setKlipyOpen(true)}
                onSelect={handleMediaSelect}
                onDeleteRequest={setPendingDeleteMedia}
                capture={flex ? {
                  busy: capturing,
                  failed: captureFailed,
                  seconds: captureSeconds,
                  onSeconds: setCaptureSeconds,
                  source: captureSource,
                  onSource: setCaptureSource,
                  onCapture: mode => { void handleCapture(mode); },
                } : undefined}
              />
            )}
            {showAnimation2d && (
              <LianLiFlexAnimation2dPanel
                overlay={sharedChoice === 'animation2d' ? representative.overlay ?? DEFAULT_OVERLAY : DEFAULT_OVERLAY}
                backgroundMediaId={sharedChoice === 'animation2d' ? representative.mediaId : undefined}
                media={media}
                onCommit={handleOverlayCommit}
              />
            )}
            {!showAnimation2d && !showMedia && sharedChoice === 'screen' && (
              <>
                <p className={styles.emptyNote} data-settings-aside="true">{t('devices.lianli-flex.screenMirrorHint')}</p>
                <LianLiScreenSourcePicker
                  label={t('devices.lianli-flex.screenSourceRegionAria')}
                  value={representative.screenSource ?? DEFAULT_SCREEN_SOURCE}
                  onPreview={screenSource => previewContentField({ screenSource })}
                  onCommit={screenSource => commitContentField('screen', { screenSource })}
                />
              </>
            )}
            {!showAnimation2d && !showMedia && sharedChoice === 'sensor' && (
              <SensorPanel
                screens={targetScreens}
                onPreview={previewContentField}
                onCommit={patch => commitContentField('sensor', patch)}
              />
            )}
            {!showAnimation2d && !showMedia && sharedChoice === 'clock' && (
              <ClockPanel
                screens={targetScreens}
                onPreview={previewContentField}
                onCommit={patch => commitContentField('clock', patch)}
              />
            )}
            {!showAnimation2d && !showMedia && sharedChoice === 'animation' && (
              <AnimationPanel
                screens={targetScreens}
                onPreview={previewContentField}
                onCommit={patch => commitContentField('animation', patch)}
              />
            )}
          </div>
        )}

        {flex && (
          <SettingRow
            label={t('devices.lianli-flex.screenSyncAll')}
            description={t('devices.lianli-flex.screenSyncAllHint')}
            disabled={selected.size !== 1}
          >
            <Button
              size="sm"
              tone="neutral"
              disabled={selected.size !== 1 || !representative || orderedScreens.length < 2}
              onClick={() => { if (representative) void handleSyncAll(representative.serial); }}
            >
              {t('devices.lianli-flex.screenSyncAllButton')}
            </Button>
          </SettingRow>
        )}
        {flex && syncFailed && (
          <p className={styles.emptyNote} role="alert" data-settings-aside="true">{t('devices.lianli-flex.screenSyncAllFailed')}</p>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept={MEDIA_ACCEPT}
          className={styles.hiddenInput}
          onChange={handleFileChange}
          data-settings-aside="true"
        />
      </SettingsSection>}

      {flex && fanScreens && (
        <LianLiFlexTemplatesSection
          serials={[...selected]}
          sourceSerial={selected.size === 1 ? representative?.serial ?? null : null}
        />
      )}

      <ConfirmModal
        open={pendingDeleteMedia != null}
        title={t('devices.lianli-wireless.deleteMediaTitle')}
        message={t('devices.lianli-wireless.deleteMediaMessage', { name: pendingDeleteMedia?.name ?? '' })}
        confirmLabel={t('common.delete')}
        onCancel={() => setPendingDeleteMedia(null)}
        onConfirm={() => {
          const item = pendingDeleteMedia;
          setPendingDeleteMedia(null);
          if (item) void deleteLianLiWirelessMedia(item.id).then(() => refreshMedia());
        }}
      />

      <KlipyPicker
        open={klipyOpen}
        busySlug={klipyBusy}
        importError={klipyOpen ? klipyError : null}
        thumbAspect={UPLOAD_ASPECT}
        onPick={gif => { void handleKlipyPick(gif); }}
        onClose={() => { setKlipyOpen(false); setKlipyError(null); }}
      />

      {cropState && (
        <MediaCropper
          src={cropState.src}
          kind={cropState.kind}
          fallbackSrc={cropState.fallbackSrc}
          aspect={UPLOAD_ASPECT}
          busy={uploading}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
    </>
  );
}

function MediaPanel({
  media, currentMediaId, uploading, onUploadClick, onKlipyClick, onSelect, onDeleteRequest, capture,
}: {
  media: LianLiWirelessMediaItem[];
  currentMediaId: string | null;
  uploading: boolean;
  onUploadClick: () => void;
  onKlipyClick: () => void;
  onSelect: (item: LianLiWirelessMediaItem) => void;
  onDeleteRequest: (item: LianLiWirelessMediaItem) => void;
  /** Wired LCD Flex only: capture the display into the library. */
  capture?: {
    busy: boolean;
    failed: boolean;
    seconds: number;
    onSeconds: (seconds: number) => void;
    source: LianLiScreenSource;
    onSource: (source: LianLiScreenSource) => void;
    onCapture: (mode: 'screenshot' | 'recording') => void;
  };
}) {
  const { t } = useTranslation();

  return (
    <div className={styles.typePanel}>
      <div className={styles.orderButtons}>
        <Button size="sm" tone="neutral" disabled={uploading} onClick={onUploadClick}>
          {uploading ? t('devices.lianli-wireless.uploading') : t('devices.lianli-wireless.uploadMedia')}
        </Button>
        <Button
          size="sm"
          tone="neutral"
          icon={<Sparkles size={16} aria-hidden />}
          disabled={uploading}
          onClick={onKlipyClick}
        >
          {t('lighting.controls.klipyBrowse')}
        </Button>
      </div>
      {capture && (
        <>
          <LianLiScreenSourcePicker
            label={t('devices.lianli-flex.captureRegionAria')}
            value={capture.source}
            onPreview={capture.onSource}
            onCommit={capture.onSource}
          />
          <div className={styles.orderButtons}>
            <Button size="sm" tone="neutral" disabled={capture.busy || uploading} onClick={() => capture.onCapture('screenshot')}>
              {capture.busy ? t('devices.lianli-flex.capturing') : t('devices.lianli-flex.captureScreenshot')}
            </Button>
            <Button size="sm" tone="neutral" disabled={capture.busy || uploading} onClick={() => capture.onCapture('recording')}>
              {capture.busy ? t('devices.lianli-flex.capturing') : t('devices.lianli-flex.captureRecording')}
            </Button>
          </div>
          <SettingSlider
            editable
            trackFill
            label={t('devices.lianli-flex.captureSeconds')}
            value={capture.seconds}
            min={CAPTURE_MIN_SECONDS}
            max={CAPTURE_MAX_SECONDS}
            step={1}
            formatValue={v => t('devices.lianli-flex.seconds', { n: v })}
            ariaLabel={t('devices.lianli-flex.captureSeconds')}
            disabled={capture.busy}
            onChange={(v: number) => capture.onSeconds(Math.round(v))}
            onCommit={(v: number) => capture.onSeconds(Math.round(v))}
          />
          {capture.failed && <p className={styles.emptyNote} role="alert">{t('devices.lianli-flex.captureFailed')}</p>}
        </>
      )}
      {media.length > 0 ? (
        <div className={styles.mediaGrid}>
          {media.map(item => (
            <EffectCard
              key={item.id}
              asDiv
              label={item.name}
              thumbUrl={item.thumb}
              thumbStatic
              thumbAspect={1}
              cornerBadge={mediaKindIcon(item.kind)}
              active={item.id === currentMediaId}
              onClick={() => onSelect(item)}
              onDelete={() => onDeleteRequest(item)}
              deleteAriaLabel={t('devices.lianli-wireless.deleteMediaAria')}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<ImageIcon size={28} />}
          title={t('devices.lianli-wireless.noMediaTitle')}
          hint={t('devices.lianli-wireless.noMediaHint')}
          compact
        />
      )}
    </div>
  );
}

const DEFAULT_COLOR_A = '#00d1ff';
const DEFAULT_COLOR_B = '#ffffff';
// Slv3LcdAnimationRenderer's secondary-color fallback differs from the sensor
// and clock renderers (which default to white).
const DEFAULT_ANIMATION_COLOR_B = '#9b5de5';

interface ContentPanelProps {
  /** The selected screens; each control shows their shared value or a mixed state. */
  screens: LianLiWirelessScreen[];
  onPreview: (patch: Partial<LianLiWirelessScreen>) => void;
  onCommit: (patch: LianLiWirelessScreenContentExtra) => void;
}

// Shared accent/secondary color row for the sensor, clock and animation
// panels: same two labels everywhere, the per-content-type meaning is
// documented on LianLiWirelessScreen.colorA/colorB.
function ColorPairRow({ screens, defaultA, defaultB, onPreview, onCommit }: {
  screens: LianLiWirelessScreen[];
  defaultA: string;
  defaultB: string;
  onPreview: (patch: Partial<LianLiWirelessScreen>) => void;
  onCommit: (patch: LianLiWirelessScreenContentExtra) => void;
}) {
  const { t } = useTranslation();
  const colorA = sharedValue(screens, s => (s.colorA ?? defaultA).toLowerCase());
  const colorB = sharedValue(screens, s => (s.colorB ?? defaultB).toLowerCase());
  const mixedLabel = t('common.mixed');
  return (
    <div className={styles.colorPairRow}>
      <div className={styles.colorEntry}>
        <span className={styles.colorLabel}>{t('devices.lianli-wireless.colorAccentLabel')}</span>
        <HsvPicker
          value={colorA.value ?? defaultA}
          mixed={colorA.mixed}
          mixedLabel={mixedLabel}
          onPreview={hex => onPreview({ colorA: hex })}
          onCommit={hex => onCommit({ colorA: hex })}
        />
      </div>
      <div className={styles.colorEntry}>
        <span className={styles.colorLabel}>{t('devices.lianli-wireless.colorSecondaryLabel')}</span>
        <HsvPicker
          value={colorB.value ?? defaultB}
          mixed={colorB.mixed}
          mixedLabel={mixedLabel}
          onPreview={hex => onPreview({ colorB: hex })}
          onCommit={hex => onCommit({ colorB: hex })}
        />
      </div>
    </div>
  );
}

function SensorPanel({ screens, onPreview, onCommit }: ContentPanelProps) {
  const { t } = useTranslation();
  const mixedLabel = t('common.mixed');
  const source = sharedValue(screens, s => s.sensorSource ?? 'cpuTemp');
  const style = sharedValue(screens, s => s.sensorStyle ?? 'ring');
  const tempUnit = sharedValue(screens, s => s.tempUnit ?? 'c');
  const isTempSource = [...source.held].some(v => v === 'cpuTemp' || v === 'gpuTemp');

  const sourceOptions: SelectOption[] = [
    { value: 'cpuTemp', label: t('devices.lianli-wireless.sensorSourceCpuTemp') },
    { value: 'cpuLoad', label: t('devices.lianli-wireless.sensorSourceCpuLoad') },
    { value: 'gpuTemp', label: t('devices.lianli-wireless.sensorSourceGpuTemp') },
    { value: 'gpuLoad', label: t('devices.lianli-wireless.sensorSourceGpuLoad') },
    { value: 'memoryUsage', label: t('devices.lianli-wireless.sensorSourceMemoryUsage') },
    { value: 'vramUsage', label: t('devices.lianli-wireless.sensorSourceVramUsage') },
    { value: 'fanRpm', label: t('devices.lianli-wireless.sensorSourceFanRpm') },
  ];
  const styleOptions: ChipOption[] = [
    { key: 'ring', label: t('devices.lianli-wireless.sensorStyleRing') },
    { key: 'bar', label: t('devices.lianli-wireless.sensorStyleBar') },
  ];
  const tempUnitOptions: ChipOption[] = [
    { key: 'c', label: t('devices.lianli-wireless.tempUnitCelsius') },
    { key: 'f', label: t('devices.lianli-wireless.tempUnitFahrenheit') },
  ];

  return (
    <div className={styles.typePanel}>
      <SettingSelect
        label={t('devices.lianli-wireless.sensorSourceLabel')}
        value={source.value ?? ''}
        placeholder={source.mixed ? mixedLabel : undefined}
        options={sourceOptions}
        onChange={v => onCommit({ sensorSource: v as LianLiWirelessScreen['sensorSource'] })}
      />
      <SettingRow label={t('devices.lianli-wireless.sensorStyleLabel')}>
        <ChipGroup
          ariaLabel={t('devices.lianli-wireless.sensorStyleLabel')}
          activeKey={style.value ?? ''}
          partialKeys={style.mixed ? style.held : undefined}
          partialLabel={mixedLabel}
          onChange={v => onCommit({ sensorStyle: v as LianLiWirelessScreen['sensorStyle'] })}
          options={styleOptions}
        />
      </SettingRow>
      {isTempSource && (
        <SettingRow label={t('devices.lianli-wireless.tempUnitLabel')}>
          <ChipGroup
            ariaLabel={t('devices.lianli-wireless.tempUnitLabel')}
            activeKey={tempUnit.value ?? ''}
            partialKeys={tempUnit.mixed ? tempUnit.held : undefined}
            partialLabel={mixedLabel}
            onChange={v => onCommit({ tempUnit: v as LianLiWirelessScreen['tempUnit'] })}
            options={tempUnitOptions}
          />
        </SettingRow>
      )}
      <ColorPairRow
        screens={screens}
        defaultA={DEFAULT_COLOR_A}
        defaultB={DEFAULT_COLOR_B}
        onPreview={onPreview}
        onCommit={onCommit}
      />
    </div>
  );
}

function ClockPanel({ screens, onPreview, onCommit }: ContentPanelProps) {
  const { t } = useTranslation();
  const face = sharedValue(screens, s => s.clockFace ?? 'digital');

  const faceOptions: ChipOption[] = [
    { key: 'digital', label: t('devices.lianli-wireless.clockFaceDigital') },
    { key: 'digitalMinimal', label: t('devices.lianli-wireless.clockFaceDigitalMinimal') },
    { key: 'analogClassic', label: t('devices.lianli-wireless.clockFaceAnalogClassic') },
    { key: 'analogMinimal', label: t('devices.lianli-wireless.clockFaceAnalogMinimal') },
  ];

  return (
    <div className={styles.typePanel}>
      <SettingRow label={t('devices.lianli-wireless.clockFaceLabel')}>
        <ChipGroup
          ariaLabel={t('devices.lianli-wireless.clockFaceLabel')}
          activeKey={face.value ?? ''}
          partialKeys={face.mixed ? face.held : undefined}
          partialLabel={t('common.mixed')}
          onChange={v => onCommit({ clockFace: v as LianLiWirelessScreen['clockFace'] })}
          options={faceOptions}
        />
      </SettingRow>
      <ColorPairRow
        screens={screens}
        defaultA={DEFAULT_COLOR_A}
        defaultB={DEFAULT_COLOR_B}
        onPreview={onPreview}
        onCommit={onCommit}
      />
    </div>
  );
}

function AnimationPanel({ screens, onPreview, onCommit }: ContentPanelProps) {
  const { t } = useTranslation();
  const animationId = sharedValue(screens, s => s.animationId ?? 'pulse');

  const animationOptions: ChipOption[] = [
    { key: 'pulse', label: t('devices.lianli-wireless.animationPulse') },
    { key: 'spectrum', label: t('devices.lianli-wireless.animationSpectrum') },
    { key: 'spin', label: t('devices.lianli-wireless.animationSpin') },
  ];

  return (
    <div className={styles.typePanel}>
      <SettingRow label={t('devices.lianli-wireless.animationLabel')}>
        <ChipGroup
          ariaLabel={t('devices.lianli-wireless.animationLabel')}
          activeKey={animationId.value ?? ''}
          partialKeys={animationId.mixed ? animationId.held : undefined}
          partialLabel={t('common.mixed')}
          onChange={v => onCommit({ animationId: v as LianLiWirelessScreen['animationId'] })}
          options={animationOptions}
        />
      </SettingRow>
      {/* Spectrum generates its own rainbow and ignores the palette. */}
      {!(animationId.value === 'spectrum') && (
        <ColorPairRow
          screens={screens}
          defaultA={DEFAULT_COLOR_A}
          defaultB={DEFAULT_ANIMATION_COLOR_B}
          onPreview={onPreview}
          onCommit={onCommit}
        />
      )}
    </div>
  );
}
