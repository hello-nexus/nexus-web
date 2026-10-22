import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Plus, Sparkles, Trash2, Wrench } from 'lucide-react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { Button } from '../../common/Button/Button';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { EffectCard } from '../../common/EffectCard/EffectCard';
import { Notice } from '../../common/Notice/Notice';
import { KlipyPicker } from '../../common/KlipyPicker/KlipyPicker';
import { MediaCropper, type NormalizedCrop } from '../../common/MediaCropper/MediaCropper';
import { SettingRow, SettingSelect, SettingToggle } from '../../common/SettingRow/SettingRow';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { ChipGroup } from '../../common/ChipGroup/ChipGroup';
import { Slider } from '../../common/Slider/Slider';
import { useToast } from '../../common/Toast/Toast';
import { SensorPicker, useSensorLookup } from '../../../panel/widgets/monitoring/picker/SensorPicker';
import { DECK_MONITORING_CATEGORIES } from '../../../panel/widgets/deck/deckMonitoring';
import { sensorsForDevice } from '../../../panel/widgets/monitoring/sensorPicker';
import {
  deleteMystiqueMedia,
  getMystiqueProgress,
  getMystiqueState,
  mystiqueSourceUrl,
  mystiqueThumbUrl,
  setMystiqueSettings,
  showMystiqueItem,
  uploadMystiqueMedia,
  MYSTIQUE_HEIGHT,
  MYSTIQUE_MAX_GIF_SECONDS,
  MYSTIQUE_MAX_GIFS,
  MYSTIQUE_MAX_PICTURES,
  MYSTIQUE_WIDTH,
  type MystiqueAnimation,
  type MystiqueAuxArea,
  type MystiqueMediaItem,
  type MystiqueMediaKind,
  type MystiqueMediaSource,
  type MystiqueMode,
  type MystiqueProgressPhase,
  type MystiqueReadout,
  type MystiqueSettingsPatch,
  type MystiqueState,
  type MystiqueStyle,
} from '../../../api/deepcool-mystique';
import { stageKlipy, type KlipyGif } from '../../../api/klipy';
import { cancelMediaStage, fetchStagedFile, mediaStagePreviewUrl, mediaStageRawUrl, stagePreviewFor } from '../../../api/mediaLibrary';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { localizeNumbers } from '../../../lib/units';
import { useReportDeviceWaiting } from './deviceDetecting';
import styles from './LianLiDevicePage.module.scss';

const POLL_MS = 3000;
const PROGRESS_POLL_MS = 500;
const MODES: readonly MystiqueMode[] = ['monitor', 'media', 'recording'];
const MODE_KEYS: Record<MystiqueMode, string> = {
  monitor: 'devices.deepcool-mystique.modeMonitor',
  media: 'devices.deepcool-mystique.modeMedia',
  recording: 'devices.deepcool-mystique.modeRecording',
};
const READOUTS: readonly MystiqueReadout[] = ['temperature', 'frequency', 'time', 'pump', 'fan', 'fanPump'];
const READOUT_KEYS: Record<MystiqueReadout, string> = {
  temperature: 'devices.deepcool-mystique.readoutTemperature',
  frequency: 'devices.deepcool-mystique.readoutFrequency',
  time: 'devices.deepcool-mystique.readoutTime',
  pump: 'devices.deepcool-mystique.readoutPump',
  fan: 'devices.deepcool-mystique.readoutFan',
  fanPump: 'devices.deepcool-mystique.readoutFanPump',
};
const STYLES: readonly MystiqueStyle[] = ['normal', 'ring', 'stopwatch'];
const STYLE_KEYS: Record<MystiqueStyle, string> = {
  normal: 'devices.deepcool-mystique.styleNormal',
  ring: 'devices.deepcool-mystique.styleRing',
  stopwatch: 'devices.deepcool-mystique.styleStopwatch',
};
const AUX_AREAS: readonly MystiqueAuxArea[] = ['voltage', 'systemMonitor', 'coreData'];
const AUX_KEYS: Record<MystiqueAuxArea, string> = {
  voltage: 'devices.deepcool-mystique.auxVoltage',
  systemMonitor: 'devices.deepcool-mystique.auxSystemMonitor',
  coreData: 'devices.deepcool-mystique.auxCoreData',
};
const SOURCES: readonly MystiqueMediaSource[] = ['images', 'gif'];
const SOURCE_KEYS: Record<MystiqueMediaSource, string> = {
  images: 'devices.deepcool-mystique.playPictures',
  gif: 'devices.deepcool-mystique.playGif',
};
const SWITCH_SECONDS: readonly number[] = [3, 5, 7];
const ANIMATIONS: readonly MystiqueAnimation[] = ['split', 'scroll', 'fade'];
const ANIMATION_KEYS: Record<MystiqueAnimation, string> = {
  split: 'devices.deepcool-mystique.animationSplit',
  scroll: 'devices.deepcool-mystique.animationScroll',
  fade: 'devices.deepcool-mystique.animationFade',
};
const SCREEN_ASPECT = MYSTIQUE_WIDTH / MYSTIQUE_HEIGHT;
// Kept sources the cropper can show; a browser cannot render the other accepted formats.
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.m4v']);
const CROPPABLE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', ...VIDEO_EXTS]);

// A local pick carries its File; a Klipy pick is staged in the service and fetched from rawUrl on confirm.
interface CropState {
  src: string;
  kind: 'video' | 'image';
  fallbackSrc?: string;
  name: string;
  target: MystiqueMediaKind;
  replace?: string;
  file?: File;
  stageId?: string;
  rawUrl?: string;
}

type PickKey = 'cpuTemperature' | 'cpuFrequency' | 'cpuUsage' | 'ramUsage' | 'cpuFan' | 'pump';
// Each readout takes one sensor type, so a picker offers only the categories that list one.
// `fallback` is the category shown while an automatic readout resolves to nothing.
const PICKS: readonly { key: PickKey; type: string; label: string; fallback: string }[] = [
  { key: 'cpuTemperature', type: 'Temperature', label: 'devices.deepcool-mystique.cpuTemperature', fallback: 'cpu' },
  { key: 'cpuFrequency', type: 'Clock', label: 'devices.deepcool-mystique.cpuFrequency', fallback: 'cpu' },
  { key: 'cpuUsage', type: 'Load', label: 'devices.deepcool-mystique.cpuUsage', fallback: 'cpu' },
  { key: 'ramUsage', type: 'Load', label: 'devices.deepcool-mystique.ramUsage', fallback: 'memory' },
  { key: 'cpuFan', type: 'Fan', label: 'devices.deepcool-mystique.cpuFan', fallback: 'motherboard' },
  { key: 'pump', type: 'Fan', label: 'devices.deepcool-mystique.pump', fallback: 'motherboard' },
];

export function DeepCoolMystiqueDevicePage() {
  const { t } = useTranslation();
  const { push } = useToast();
  const { numberFormat } = useUnitPrefs();
  const lookup = useSensorLookup();
  const [state, setState] = useState<MystiqueState | null>(null);
  useReportDeviceWaiting(state === null || !state.isConnected);
  const aliveRef = useRef(true);
  // Writes in flight: a poll landing meanwhile would snap a control back.
  const busyRef = useRef(0);
  // Bumped when a write starts and when it settles; a read that began before either is stale.
  const writeGenRef = useRef(0);
  // A brightness drag is under way, so a poll must not move the thumb.
  const draggingRef = useRef(false);
  // The brightness the service last reported or accepted, so a commit that changes nothing sends nothing.
  const brightnessRef = useRef<number | null>(null);
  const pictureInputRef = useRef<HTMLInputElement>(null);
  const gifInputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<Record<MystiqueMediaKind, string | null>>({ picture: null, gif: null });
  // An item awaiting confirmation of its removal; 'all' for every item.
  const [pendingRemove, setPendingRemove] = useState<MystiqueMediaItem | 'all' | null>(null);
  const [cropState, setCropState] = useState<CropState | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  // The GIF being sent to the screen by a tile click.
  const [showing, setShowing] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ phase: MystiqueProgressPhase; percent: number } | null>(null);
  // Bumped after each upload so a replaced item's thumbnail reloads under the same id.
  const [thumbVersion, setThumbVersion] = useState(0);
  const [klipyOpen, setKlipyOpen] = useState(false);
  const [klipyBusy, setKlipyBusy] = useState<string | null>(null);
  const [klipyError, setKlipyError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (busyRef.current > 0 || draggingRef.current) return;
    const gen = writeGenRef.current;
    const next = await getMystiqueState();
    if (!aliveRef.current || next === null || busyRef.current > 0 || draggingRef.current || gen !== writeGenRef.current) return;
    brightnessRef.current = next.brightness;
    setState(next);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void refresh();
    const id = window.setInterval(() => { void refresh(); }, POLL_MS);
    window.addEventListener('focus', refresh);
    return () => {
      aliveRef.current = false;
      window.clearInterval(id);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  const transferring = uploading || showing !== null;
  useEffect(() => {
    if (!transferring) {
      setProgress(null);
      return;
    }
    let live = true;
    let timer: number | undefined;
    // The next poll is scheduled once a response lands, so polls never overlap.
    const poll = async () => {
      const next = await getMystiqueProgress();
      if (!live) return;
      if (next) setProgress(prev => (next.phase === '' ? null : prev?.phase === next.phase && prev.percent === next.percent ? prev : next));
      timer = window.setTimeout(() => { void poll(); }, PROGRESS_POLL_MS);
    };
    void poll();
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [transferring]);

  const commit = useCallback(async (patch: MystiqueSettingsPatch) => {
    busyRef.current += 1;
    writeGenRef.current += 1;
    let ok = false;
    try {
      ok = await setMystiqueSettings(patch);
    } catch {
      ok = false;
    } finally {
      busyRef.current -= 1;
      writeGenRef.current += 1;
    }
    if (!ok) push({ title: t('devices.deepcool-mystique.failedTitle'), body: t('devices.deepcool-mystique.failedBody') });
    const gen = writeGenRef.current;
    const next = await getMystiqueState();
    if (aliveRef.current && next !== null && busyRef.current === 0 && !draggingRef.current && gen === writeGenRef.current) {
      brightnessRef.current = next.brightness;
      setState(next);
    }
  }, [push, t]);

  const edit = useCallback((local: Partial<MystiqueState>, patch: MystiqueSettingsPatch) => {
    setState(prev => prev && { ...prev, ...local });
    void commit(patch);
  }, [commit]);

  const pickFile = (target: MystiqueMediaKind) => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCropState({
      src: URL.createObjectURL(file),
      kind: file.type.startsWith('video/') ? 'video' : 'image',
      name: file.name,
      target,
      file,
    });
  };

  const addMedia = (kind: MystiqueMediaKind, count: number) => {
    if (!ready || mediaBusy) return;
    if (count >= (kind === 'gif' ? MYSTIQUE_MAX_GIFS : MYSTIQUE_MAX_PICTURES)) {
      push({ title: t('devices.deepcool-mystique.mediaFullTitle'), body: t('devices.deepcool-mystique.mediaFullBody') });
      return;
    }
    (kind === 'gif' ? gifInputRef : pictureInputRef).current?.click();
  };

  // Re-crops the kept source and uploads it under the same id, which the screen replaces in place.
  const editMedia = (item: MystiqueMediaItem) => {
    const src = mystiqueSourceUrl(item.id);
    setCropState({
      src,
      kind: VIDEO_EXTS.has(item.ext) ? 'video' : 'image',
      name: `${item.name}${item.ext}`,
      target: item.kind,
      replace: item.id,
      rawUrl: src,
    });
  };

  const removeMedia = async (target: MystiqueMediaItem | 'all') => {
    setRemoving(true);
    try {
      busyRef.current += 1;
      writeGenRef.current += 1;
      let ok = false;
      try {
        ok = await deleteMystiqueMedia(target === 'all' ? undefined : target.id);
      } catch {
        ok = false;
      } finally {
        busyRef.current -= 1;
        writeGenRef.current += 1;
      }
      if (!aliveRef.current) return;
      if (!ok) push({ title: t('devices.deepcool-mystique.removeFailedTitle'), body: t('devices.deepcool-mystique.removeFailedBody') });
      const gen = writeGenRef.current;
      const next = await getMystiqueState();
      if (aliveRef.current && next !== null && busyRef.current === 0 && !draggingRef.current && gen === writeGenRef.current) {
        brightnessRef.current = next.brightness;
        setState(next);
      }
    } finally {
      if (aliveRef.current) setRemoving(false);
    }
  };

  // The screen has no select command: a click sends the chosen GIF, or moves the chosen picture to where the pictures start.
  const showItem = async (item: MystiqueMediaItem) => {
    setShowing(item.id);
    try {
      busyRef.current += 1;
      writeGenRef.current += 1;
      let res: Awaited<ReturnType<typeof showMystiqueItem>> = null;
      try {
        res = await showMystiqueItem(item.id);
      } finally {
        busyRef.current -= 1;
        writeGenRef.current += 1;
      }
      if (!aliveRef.current) return;
      if (!res?.ok) {
        setSelected(prev => ({ ...prev, [item.kind]: null }));
      }
      if (res?.notKept) {
        push({ title: t('devices.deepcool-mystique.notKeptTitle', { name: item.name }), body: t('devices.deepcool-mystique.notKeptBody') });
      } else if (!res?.ok) {
        push({ title: t('devices.deepcool-mystique.showFailedTitle', { name: item.name }), body: t('devices.deepcool-mystique.showFailedBody') });
      }
      const gen = writeGenRef.current;
      const next = await getMystiqueState();
      if (aliveRef.current && next !== null && busyRef.current === 0 && !draggingRef.current && gen === writeGenRef.current) {
        brightnessRef.current = next.brightness;
        setState(next);
      }
    } finally {
      if (aliveRef.current) setShowing(null);
    }
  };

  const handleCropConfirm = useCallback(async (crop: NormalizedCrop) => {
    if (!cropState) return;
    const { file, src, name, stageId, rawUrl, target, replace } = cropState;
    // The cropper stays mounted and busy until the encode and the transfer to the screen finish.
    setUploading(true);
    try {
      busyRef.current += 1;
      writeGenRef.current += 1;
      try {
        const upload = file ?? (rawUrl ? await fetchStagedFile(rawUrl, name) : null);
        const result = upload ? await uploadMystiqueMedia(upload, target, crop, replace) : null;
        if (!result?.ok) {
          push({ title: t('devices.deepcool-mystique.uploadFailedTitle'), body: t('devices.deepcool-mystique.uploadFailedBody') });
        } else if (result.id && aliveRef.current) {
          setSelected(prev => ({ ...prev, [target]: result.id }));
        }
        setThumbVersion(v => v + 1);
      } finally {
        busyRef.current -= 1;
        writeGenRef.current += 1;
      }
      const gen = writeGenRef.current;
      const next = await getMystiqueState();
      if (aliveRef.current && next !== null && busyRef.current === 0 && !draggingRef.current && gen === writeGenRef.current) {
        brightnessRef.current = next.brightness;
        setState(next);
      }
    } finally {
      if (file) URL.revokeObjectURL(src);
      if (stageId) cancelMediaStage(stageId).catch(() => {});
      if (aliveRef.current) {
        setUploading(false);
        setCropState(null);
      }
    }
  }, [cropState, push, t]);

  const handleCropCancel = useCallback(() => {
    if (cropState?.file) URL.revokeObjectURL(cropState.src);
    if (cropState?.stageId) cancelMediaStage(cropState.stageId).catch(() => {});
    setCropState(null);
  }, [cropState]);

  // A pick is staged like the other Klipy surfaces and lands in the same cropper as a file.
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
    if (staged.error || !staged.stageId) {
      setKlipyError(t('lighting.controls.klipyPickFailed'));
      return;
    }
    setKlipyOpen(false);
    const rawUrl = mediaStageRawUrl(staged.stageId);
    setCropState({
      ...stagePreviewFor(staged.mediaKind, rawUrl, mediaStagePreviewUrl(staged.stageId)),
      name: `${gif.slug}.${staged.mediaKind === 'gif' ? 'gif' : 'mp4'}`,
      target: 'gif',
      stageId: staged.stageId,
      rawUrl,
    });
  }, [t]);

  const ready = state !== null && state.isConnected;
  // An upload or a removal is talking to the screen, so the other media actions wait.
  const mediaBusy = uploading || removing || showing !== null;
  const progressStatus = progress && {
    percent: progress.percent,
    message: t(progress.phase === 'sending' ? 'devices.deepcool-mystique.progressSending' : 'devices.deepcool-mystique.progressConverting'),
  };
  const pictures = state?.media.filter(m => m.kind === 'picture') ?? [];
  const gifs = state?.media.filter(m => m.kind === 'gif') ?? [];
  const sourceOf = (kind: MystiqueMediaKind): MystiqueMediaSource => (kind === 'gif' ? 'gif' : 'images');
  const kindShown = (kind: MystiqueMediaKind) => !!state?.sourceChosen && state.mediaSource === sourceOf(kind);
  const shownId = (kind: MystiqueMediaKind) => (kind === 'gif' ? state?.shownGif : state?.shownPicture) || null;
  // Until an item is clicked, the one the screen shows is the selection.
  const selectedId = (kind: MystiqueMediaKind) => selected[kind] ?? (kindShown(kind) ? shownId(kind) : null);
  const selectedItem = (kind: MystiqueMediaKind) => state?.media.find(m => m.kind === kind && m.id === selectedId(kind));

  const selectMedia = (item: MystiqueMediaItem) => {
    if (!ready || mediaBusy || !state) return;
    setSelected({ picture: null, gif: null, [item.kind]: item.id });
    if (item.id !== shownId(item.kind) || (item.kind === 'picture' && state.picturesUnsent)) {
      void showItem(item);
    } else if (!kindShown(item.kind)) {
      edit({ mediaSource: sourceOf(item.kind), sourceChosen: true }, { mediaSource: sourceOf(item.kind) });
    }
  };

  // The add tile first, then the items.
  const mediaGrid = (kind: MystiqueMediaKind, items: MystiqueMediaItem[]) => (
    <div className={`${styles.mediaGrid} ${styles.mediaGridCompact}`}>
      <EffectCard
        label={t(kind === 'gif' ? 'devices.deepcool-mystique.addGif' : 'devices.deepcool-mystique.addPicture')}
        thumbUrl={null}
        thumbStatic
        thumbAspect={SCREEN_ASPECT}
        thumbOverlay={<span className={styles.mediaOverlay}><Plus size={28} aria-hidden /></span>}
        active={false}
        disabled={!ready || mediaBusy}
        onClick={() => addMedia(kind, items.length)}
      />
      {items.map(item => (
        <EffectCard
          key={item.id}
          asDiv
          label={item.name}
          keepCase
          thumbUrl={mystiqueThumbUrl(item.id, thumbVersion)}
          thumbStatic
          thumbAspect={SCREEN_ASPECT}
          thumbOverlay={showing === item.id ? (
            <span className={styles.mediaOverlay} aria-hidden>
              {localizeNumbers(`${progressStatus?.percent ?? 0}%`, numberFormat)}
            </span>
          ) : undefined}
          disabled={(!ready || mediaBusy) && showing !== item.id}
          active={kindShown(kind) && selectedId(kind) === item.id}
          ariaLabel={t('devices.deepcool-mystique.showItem', { name: item.name })}
          onClick={() => selectMedia(item)}
          onDelete={ready && !mediaBusy ? () => setPendingRemove(item) : undefined}
          deleteAriaLabel={t('devices.deepcool-mystique.removeItem', { name: item.name })}
        />
      ))}
    </div>
  );

  const editButton = (kind: MystiqueMediaKind) => {
    const item = selectedItem(kind);
    return (
      <Button
        size="sm"
        tone="neutral"
        icon={<Wrench size={16} aria-hidden />}
        disabled={!ready || mediaBusy || !item || !item.editable || !CROPPABLE_EXTS.has(item.ext)}
        onClick={() => { if (item) editMedia(item); }}
      >
        {t('devices.deepcool-mystique.editSelected')}
      </Button>
    );
  };
  const chosen = state?.modeChosen === true;
  const mode = state?.mode ?? 'monitor';

  const categoriesByType = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const type of new Set(PICKS.map(p => p.type))) {
      out[type] = DECK_MONITORING_CATEGORIES.filter(c => sensorsForDevice(lookup.sensors, lookup.networkSensors, lookup.extras, c).some(o => o.type === type));
    }
    return out;
  }, [lookup.sensors, lookup.networkSensors, lookup.extras]);

  const picker = (key: PickKey, type: string, fallback: string) => {
    const slot = state?.[key];
    const onPick = (category: string, sensor: string) => {
      if (!state) return;
      edit({ [key]: { ...state[key], category, sensor } }, { [key]: { category, sensor } });
    };
    return (
      <SensorPicker
        lookup={lookup}
        category={(slot?.sensor ? slot.category : slot?.resolvedCategory) || fallback}
        sensor={slot?.sensor || slot?.resolvedSensor || ''}
        disabled={!ready}
        categories={categoriesByType[type]}
        sensorTypes={[type]}
        automatic={{ label: t('devices.deepcool-mystique.automatic'), active: !slot?.sensor, onSelect: () => onPick('', '') }}
        onChange={sel => onPick(sel.category, sel.sensor)}
      />
    );
  };

  return (
    <div className={styles.page}>
      <ViewHeader
        // eslint-disable-next-line i18next/no-literal-string -- brand + model name
        title="DeepCool Mystique"
      />
      <div className={`${styles.pageBody} pageBody`}>
        <SettingsSection title={t('devices.deepcool-mystique.displaySection')} boxClassName={styles.sectionBox}>
          <Slider
            editable
            trackFill
            // eslint-disable-next-line i18next/no-literal-string -- slider layout enum
            orientation="stacked"
            label={t('devices.deepcool-mystique.brightness')}
            ariaLabel={t('devices.deepcool-mystique.brightnessAria')}
            value={state?.brightness ?? 0}
            min={0}
            max={100}
            step={1}
            formatValue={v => localizeNumbers(`${v}%`, numberFormat)}
            disabled={!ready}
            onPointerDown={e => { if (e.button === 0) draggingRef.current = true; }}
            onPointerCancel={() => { draggingRef.current = false; }}
            onChange={v => setState(prev => prev && { ...prev, brightness: v })}
            onCommit={v => {
              draggingRef.current = false;
              if (v === brightnessRef.current) return;
              brightnessRef.current = v;
              void commit({ brightness: v });
            }}
          />
          <SettingToggle
            label={t('devices.deepcool-mystique.gyroscope')}
            description={t('devices.deepcool-mystique.gyroscopeHint')}
            checked={state?.gyroscope ?? false}
            disabled={!ready}
            onChange={on => edit({ gyroscope: on }, { gyroscope: on })}
          />
          <SettingToggle
            label={t('devices.deepcool-mystique.rgbSync')}
            checked={state?.rgbSync ?? false}
            disabled={!ready}
            onChange={on => edit({ rgbSync: on }, { rgbSync: on })}
          />
          <SettingToggle
            label={t('devices.deepcool-mystique.edgePicking')}
            description={t('devices.deepcool-mystique.edgePickingHint')}
            checked={state?.edgePicking ?? false}
            disabled={!ready}
            onChange={on => edit({ edgePicking: on }, { edgePicking: on })}
          />
        </SettingsSection>

        <SettingsSection title={t('devices.deepcool-mystique.contentSection')} boxClassName={styles.sectionBox}>
          <SettingRow label={t('devices.deepcool-mystique.mode')}>
            <ChipGroup
              ariaLabel={t('devices.deepcool-mystique.mode')}
              activeKey={chosen ? mode : ''}
              options={MODES.map(m => ({ key: m, label: t(MODE_KEYS[m]), disabled: !ready }))}
              onChange={key => edit({ mode: key as MystiqueMode, modeChosen: true }, { mode: key as MystiqueMode })}
            />
          </SettingRow>

          {chosen && mode === 'media' && state && (
            <>
              <SettingRow label={t('devices.deepcool-mystique.play')}>
                <ChipGroup
                  ariaLabel={t('devices.deepcool-mystique.play')}
                  activeKey={state.sourceChosen ? state.mediaSource : ''}
                  options={SOURCES.map(v => ({ key: v, label: t(SOURCE_KEYS[v]), disabled: !ready || mediaBusy }))}
                  onChange={key => edit({ mediaSource: key as MystiqueMediaSource, sourceChosen: true }, { mediaSource: key as MystiqueMediaSource })}
                />
              </SettingRow>
              {state.gifSlotUnsure && state.media.length > 0 && (
                <Notice tone="info">{t('devices.deepcool-mystique.removeAllOnceNotice')}</Notice>
              )}
              <SettingRow label={t('devices.deepcool-mystique.pictures')}>
                {editButton('picture')}
              </SettingRow>
              <div className={styles.visuallyHidden} aria-live="polite">
                {showing !== null && progressStatus ? localizeNumbers(`${progressStatus.message} ${progressStatus.percent}%`, numberFormat) : ''}
              </div>
              {mediaGrid('picture', pictures)}
              <SettingRow label={t('devices.deepcool-mystique.switchTime')}>
                <ChipGroup
                  ariaLabel={t('devices.deepcool-mystique.switchTime')}
                  activeKey={state.mediaChosen ? String(state.switchSeconds) : ''}
                  options={SWITCH_SECONDS.map(v => ({
                    key: String(v),
                    label: localizeNumbers(t('devices.deepcool-mystique.seconds', { value: v }), numberFormat),
                    disabled: !ready || mediaBusy,
                  }))}
                  onChange={key => edit({ switchSeconds: Number(key), mediaChosen: true }, { switchSeconds: Number(key) })}
                />
              </SettingRow>
              <SettingRow label={t('devices.deepcool-mystique.animation')}>
                <ChipGroup
                  ariaLabel={t('devices.deepcool-mystique.animation')}
                  activeKey={state.mediaChosen ? state.animation : ''}
                  options={ANIMATIONS.map(v => ({ key: v, label: t(ANIMATION_KEYS[v]), disabled: !ready || mediaBusy }))}
                  onChange={key => edit({ animation: key as MystiqueAnimation, mediaChosen: true }, { animation: key as MystiqueAnimation })}
                />
              </SettingRow>
              <SettingRow label={t('devices.deepcool-mystique.gif')} description={localizeNumbers(t('devices.deepcool-mystique.gifHint', { seconds: MYSTIQUE_MAX_GIF_SECONDS }), numberFormat)}>
                <Button
                  size="sm"
                  tone="neutral"
                  icon={<Sparkles size={16} aria-hidden />}
                  disabled={!ready || mediaBusy || gifs.length >= MYSTIQUE_MAX_GIFS}
                  onClick={() => setKlipyOpen(true)}
                >
                  {t('lighting.controls.klipyBrowse')}
                </Button>
                {editButton('gif')}
              </SettingRow>
              {mediaGrid('gif', gifs)}
              <SettingRow label={t('devices.deepcool-mystique.removeAll')}>
                <Button
                  size="sm"
                  tone="danger"
                  icon={<Trash2 size={16} aria-hidden />}
                  disabled={!ready || mediaBusy || state.media.length === 0}
                  onClick={() => setPendingRemove('all')}
                >
                  {t('devices.deepcool-mystique.removeAllButton')}
                </Button>
              </SettingRow>
              <input ref={pictureInputRef} type="file" accept="image/*" className={styles.hiddenInput} onChange={pickFile('picture')} />
              <input ref={gifInputRef} type="file" accept="image/gif,video/*" className={styles.hiddenInput} onChange={pickFile('gif')} />
            </>
          )}

          {chosen && mode === 'monitor' && state && (
            <>
              <SettingSelect
                label={t('devices.deepcool-mystique.readout')}
                value={state.readoutChosen ? state.readout : ''}
                placeholder={t('devices.deepcool-mystique.notSet')}
                options={READOUTS.map(r => ({ value: r, label: t(READOUT_KEYS[r]) }))}
                disabled={!ready}
                onChange={v => edit({ readout: v as MystiqueReadout, readoutChosen: true }, { readout: v as MystiqueReadout })}
              />
              <SettingSelect
                label={t('devices.deepcool-mystique.style')}
                value={state.readoutChosen ? state.readoutStyle : ''}
                placeholder={t('devices.deepcool-mystique.notSet')}
                options={STYLES.map(v => ({ value: v, label: t(STYLE_KEYS[v]) }))}
                disabled={!ready}
                onChange={v => edit({ readoutStyle: v as MystiqueStyle, readoutChosen: true }, { style: v as MystiqueStyle })}
              />
              <SettingSelect
                label={t('devices.deepcool-mystique.auxArea')}
                value={state.readoutChosen ? state.auxArea : ''}
                placeholder={t('devices.deepcool-mystique.notSet')}
                options={AUX_AREAS.map(v => ({ value: v, label: t(AUX_KEYS[v]) }))}
                disabled={!ready}
                onChange={v => edit({ auxArea: v as MystiqueAuxArea, readoutChosen: true }, { auxArea: v as MystiqueAuxArea })}
              />
            </>
          )}

          {chosen && mode === 'recording' && state && (
            <>
              <SettingToggle
                label={t('devices.deepcool-mystique.recordFrequency')}
                checked={state.recordFrequency}
                disabled={!ready}
                onChange={on => edit({ recordFrequency: on }, { recordFrequency: on })}
              />
              <SettingToggle
                label={t('devices.deepcool-mystique.recordTemperature')}
                checked={state.recordTemperature}
                disabled={!ready}
                onChange={on => edit({ recordTemperature: on }, { recordTemperature: on })}
              />
            </>
          )}
        </SettingsSection>

        <SettingsSection title={t('devices.deepcool-mystique.inputsSection')} boxClassName={styles.sectionBox}>
          {PICKS.map(({ key, type, label, fallback }) => (
            <SettingRow key={key} label={t(label)}>
              {picker(key, type, fallback)}
            </SettingRow>
          ))}
        </SettingsSection>
      </div>

      <KlipyPicker
        open={klipyOpen}
        busySlug={klipyBusy}
        importError={klipyOpen ? klipyError : null}
        thumbAspect={SCREEN_ASPECT}
        onPick={pick => { void handleKlipyPick(pick); }}
        onClose={() => { setKlipyOpen(false); setKlipyError(null); }}
      />

      <ConfirmModal
        open={pendingRemove !== null}
        title={pendingRemove === 'all'
          ? t('devices.deepcool-mystique.removeAllConfirmTitle')
          : t('devices.deepcool-mystique.removeConfirmTitle', { name: pendingRemove?.name ?? '' })}
        message={t(pendingRemove === 'all' ? 'devices.deepcool-mystique.removeAllConfirmBody' : 'devices.deepcool-mystique.removeConfirmBody')}
        confirmLabel={t('devices.deepcool-mystique.remove')}
        onCancel={() => setPendingRemove(null)}
        onConfirm={() => {
          const target = pendingRemove;
          setPendingRemove(null);
          if (target) void removeMedia(target);
        }}
      />

      {cropState && (
        <MediaCropper
          src={cropState.src}
          kind={cropState.kind}
          fallbackSrc={cropState.fallbackSrc}
          aspect={SCREEN_ASPECT}
          busy={uploading}
          busyProgress={progressStatus}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
    </div>
  );
}
