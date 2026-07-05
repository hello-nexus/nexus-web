import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MonitorOff, Image as ImageIcon, Film, Video, Gauge, Clock, Sparkles,
} from 'lucide-react';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { ChipGroup, type ChipOption } from '../../common/ChipGroup/ChipGroup';
import { Select, type SelectOption } from '../../common/Select/Select';
import { SettingRow, SettingSelect, SettingSlider } from '../../common/SettingRow/SettingRow';
import { HsvPicker } from '../../common/HsvPicker/HsvPicker';
import { Button } from '../../common/Button/Button';
import { EffectCard } from '../../common/EffectCard/EffectCard';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { MediaCropper, type NormalizedCrop } from '../../common/MediaCropper/MediaCropper';
import {
  getLianLiWirelessScreens,
  getLianLiWirelessMedia,
  setLianLiWirelessScreenSettings,
  setLianLiWirelessScreenContent,
  importLianLiWirelessMedia,
  deleteLianLiWirelessMedia,
  type LianLiWirelessScreen,
  type LianLiWirelessScreenContentType,
  type LianLiWirelessScreenContentExtra,
  type LianLiWirelessMediaItem,
  type LianLiWirelessMediaKind,
} from '../../../api/lianli-wireless';
import { useTranslation } from '../../../lib/i18n';
import styles from './LianLiWirelessDevicePage.module.scss';

const SCREENS_POLL_MS = 2000;
// One poll interval plus margin: long enough that the poll following an edit's
// POST observes the applied server state before it resumes overwriting.
const EDIT_POLL_GRACE_MS = 2500;

const CONTENT_TYPES: { value: LianLiWirelessScreenContentType; labelKey: string }[] = [
  { value: 'off', labelKey: 'devices.lianli-wireless.contentTypeOff' },
  { value: 'image', labelKey: 'devices.lianli-wireless.contentTypePicture' },
  { value: 'gif', labelKey: 'devices.lianli-wireless.contentTypeDynamic' },
  { value: 'video', labelKey: 'devices.lianli-wireless.contentTypeVideo' },
  { value: 'sensor', labelKey: 'devices.lianli-wireless.contentTypeSensor' },
  { value: 'clock', labelKey: 'devices.lianli-wireless.contentTypeClock' },
  { value: 'animation', labelKey: 'devices.lianli-wireless.contentTypeAnimation' },
];

const ROTATIONS = [0, 1, 2, 3];

const SELECTION_MODES: { key: 'single' | 'multiple'; labelKey: string }[] = [
  { key: 'single', labelKey: 'devices.lianli-wireless.selectionModeSingle' },
  { key: 'multiple', labelKey: 'devices.lianli-wireless.selectionModeMultiple' },
];

function acceptForKind(kind: LianLiWirelessMediaKind): string {
  if (kind === 'video') return 'video/mp4';
  if (kind === 'gif') return 'image/gif';
  return 'image/jpeg,image/png';
}

function contentTypeIcon(type: LianLiWirelessScreenContentType) {
  switch (type) {
    case 'image': return <ImageIcon size={20} aria-hidden />;
    case 'gif': return <Film size={20} aria-hidden />;
    case 'video': return <Video size={20} aria-hidden />;
    case 'sensor': return <Gauge size={20} aria-hidden />;
    case 'clock': return <Clock size={20} aria-hidden />;
    case 'animation': return <Sparkles size={20} aria-hidden />;
    default: return <MonitorOff size={20} aria-hidden />;
  }
}

/**
 * Screen tab: LCD content, brightness and rotation for the wireless SLV3-LCD
 * fan screens. Fans are selected by toggling their tiles; every edit is
 * broadcast to all selected fans, so selecting several edits them as a group.
 * Polls its own `/screens` list independently of the shell's fan-state poll.
 */
export function LianLiWirelessScreenTab() {
  const { t } = useTranslation();
  const [screens, setScreens] = useState<LianLiWirelessScreen[] | null>(null);
  const [media, setMedia] = useState<LianLiWirelessMediaItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [selectionMode, setSelectionMode] = useState<'single' | 'multiple'>('single');
  const [brightnessDraft, setBrightnessDraft] = useState(50);
  const [uploadKind, setUploadKind] = useState<LianLiWirelessMediaKind>('image');
  const [uploading, setUploading] = useState(false);
  const [cropState, setCropState] = useState<{ src: string; file: File } | null>(null);
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
    const s = await getLianLiWirelessScreens();
    if (aliveRef.current && performance.now() - lastEditRef.current > EDIT_POLL_GRACE_MS) {
      setScreens(s);
    }
  }, []);

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

  const loaded = screens !== null;
  const orderedScreens = useMemo(
    () => (screens ? [...screens].sort((a, b) => a.position - b.position) : []),
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

  const toggleScreen = useCallback((serial: string) => {
    setSelected(prev => {
      if (selectionMode === 'single') return new Set([serial]);
      const next = new Set(prev);
      if (next.has(serial)) next.delete(serial); else next.add(serial);
      return next;
    });
  }, [selectionMode]);

  const handleModeChange = useCallback((mode: string) => {
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
  const representative = targetScreens[0] ?? null;
  // When several fans with different content types are selected the content
  // controls can't show one truth; force a fresh pick instead.
  const sharedContentType = targetScreens.length > 0
    && targetScreens.every(s => s.contentType === targetScreens[0].contentType)
    ? targetScreens[0].contentType
    : null;
  const contentMixed = targetScreens.length > 0 && sharedContentType === null;

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
    const rounded = Math.round(v);
    setBrightnessDraft(rounded);
    applyToTargets(
      s => ({ ...s, brightness: rounded }),
      serial => { void setLianLiWirelessScreenSettings(serial, { brightness: rounded }); },
    );
  }, [applyToTargets]);

  const handleRotationChange = useCallback((rotation: number) => {
    applyToTargets(
      s => ({ ...s, rotation }),
      serial => { void setLianLiWirelessScreenSettings(serial, { rotation }); },
    );
  }, [applyToTargets]);

  const handleContentTypeChange = useCallback((contentType: LianLiWirelessScreenContentType) => {
    applyToTargets(
      s => ({ ...s, contentType }),
      serial => { void setLianLiWirelessScreenContent(serial, contentType); },
    );
  }, [applyToTargets]);

  const handleMediaSelect = useCallback((item: LianLiWirelessMediaItem) => {
    applyToTargets(
      s => ({ ...s, contentType: item.kind, mediaId: item.id }),
      serial => { void setLianLiWirelessScreenContent(serial, item.kind, item.id); },
    );
  }, [applyToTargets]);

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
      serial => { void setLianLiWirelessScreenContent(serial, contentType, undefined, patch); },
    );
  }, [applyToTargets]);

  const openUpload = useCallback((kind: LianLiWirelessMediaKind) => {
    setUploadKind(kind);
    // React batches the state update above, so the input's JSX-bound accept
    // wouldn't reflect `kind` yet at the moment the OS file picker opens; set
    // it imperatively here so the filter is right on the very first click.
    const input = fileInputRef.current;
    if (input) {
      input.accept = acceptForKind(kind);
      input.click();
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setCropState({ src: URL.createObjectURL(file), file });
  };

  const handleCropConfirm = useCallback(async (crop: NormalizedCrop) => {
    if (!cropState) return;
    const { file, src } = cropState;
    // Keep the cropper mounted + busy through the encode (gif/video transcode
    // is slow); it disables its own buttons and shows a converting overlay.
    // Close only once the import fully resolves.
    setUploading(true);
    try {
      const item = await importLianLiWirelessMedia(file, crop);
      await refreshMedia();
      if (item && aliveRef.current) handleMediaSelect(item);
    } finally {
      URL.revokeObjectURL(src);
      if (aliveRef.current) {
        setUploading(false);
        setCropState(null);
      }
    }
  }, [cropState, refreshMedia, handleMediaSelect]);

  const handleCropCancel = useCallback(() => {
    if (cropState) URL.revokeObjectURL(cropState.src);
    setCropState(null);
  }, [cropState]);

  const contentTypeOptions: SelectOption[] = CONTENT_TYPES.map(ct => ({
    value: ct.value,
    label: t(ct.labelKey),
  }));

  return (
    <>
      <SettingsSection
        title={t('devices.lianli-wireless.selectionSection')}
        boxClassName={styles.sectionBox}
      >
        {!loaded && <p className={styles.emptyNote}>{t('devices.lianli-wireless.loadingScreens')}</p>}
        {loaded && orderedScreens.length === 0 && (
          <p className={styles.emptyNote}>{t('devices.lianli-wireless.noScreens')}</p>
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
                      {t('devices.lianli-wireless.fanN', { n: i + 1 })}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </SettingsSection>

      <SettingsSection
        title={t('devices.lianli-wireless.displaySection')}
        boxClassName={styles.sectionBox}
      >
        <SettingSlider
          editable
          trackFill
          label={t('devices.lianli-wireless.brightness')}
          value={brightnessDraft}
          min={0}
          max={100}
          step={1}
          formatValue={v => `${v}%`}
          ariaLabel={t('devices.lianli-wireless.brightness')}
          disabled={!representative}
          onChange={(v, commit) => {
            const rounded = Math.round(v);
            if (commit) { commitBrightness(rounded); return; }
            brightnessInteractingRef.current = true;
            setBrightnessDraft(rounded);
          }}
          onCommit={commitBrightness}
        />
        <SettingRow label={t('devices.lianli-wireless.rotationLabel')} disabled={!representative}>
          <ChipGroup
            ariaLabel={t('devices.lianli-wireless.rotationLabel')}
            activeKey={String(representative?.rotation ?? 0)}
            onChange={v => handleRotationChange(Number(v))}
            options={ROTATIONS.map(r => ({
              key: String(r),
              label: t('devices.lianli-wireless.rotationDegrees', { n: r * 90 }),
            }))}
          />
        </SettingRow>
      </SettingsSection>

      <SettingsSection
        title={t('devices.lianli-wireless.contentSection')}
        boxClassName={styles.sectionBox}
      >
        <SettingRow label={t('devices.lianli-wireless.contentTypeLabel')} disabled={!representative}>
          <Select
            className={styles.contentTypeSelect}
            value={contentMixed ? '' : (sharedContentType ?? 'off')}
            placeholder={t('devices.lianli-wireless.contentTypeMixed')}
            options={contentTypeOptions}
            disabled={!representative}
            onChange={v => handleContentTypeChange(v as LianLiWirelessScreenContentType)}
            ariaLabel={t('devices.lianli-wireless.contentTypeAria')}
          />
        </SettingRow>
        {contentMixed && (
          <p className={styles.emptyNote}>{t('devices.lianli-wireless.contentMixedHint')}</p>
        )}

        {representative && !contentMixed && (
          <>
            {representative.contentType === 'image' && (
              <MediaPanel
                kind="image"
                media={media}
                currentMediaId={representative.mediaId ?? null}
                uploading={uploading}
                onUploadClick={() => openUpload('image')}
                onSelect={handleMediaSelect}
                onDeleteRequest={setPendingDeleteMedia}
              />
            )}
            {representative.contentType === 'gif' && (
              <MediaPanel
                kind="gif"
                media={media}
                currentMediaId={representative.mediaId ?? null}
                uploading={uploading}
                onUploadClick={() => openUpload('gif')}
                onSelect={handleMediaSelect}
                onDeleteRequest={setPendingDeleteMedia}
              />
            )}
            {representative.contentType === 'video' && (
              <MediaPanel
                kind="video"
                media={media}
                currentMediaId={representative.mediaId ?? null}
                uploading={uploading}
                onUploadClick={() => openUpload('video')}
                onSelect={handleMediaSelect}
                onDeleteRequest={setPendingDeleteMedia}
              />
            )}
            {representative.contentType === 'sensor' && (
              <SensorPanel
                screen={representative}
                onPreview={previewContentField}
                onCommit={patch => commitContentField('sensor', patch)}
              />
            )}
            {representative.contentType === 'clock' && (
              <ClockPanel
                screen={representative}
                onPreview={previewContentField}
                onCommit={patch => commitContentField('clock', patch)}
              />
            )}
            {representative.contentType === 'animation' && (
              <AnimationPanel
                screen={representative}
                onPreview={previewContentField}
                onCommit={patch => commitContentField('animation', patch)}
              />
            )}
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept={acceptForKind(uploadKind)}
          className={styles.hiddenInput}
          onChange={handleFileChange}
        />
      </SettingsSection>

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

      {cropState && (
        <MediaCropper
          src={cropState.src}
          kind={uploadKind === 'video' ? 'video' : 'image'}
          aspect={1}
          busy={uploading}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
    </>
  );
}

function MediaPanel({
  kind, media, currentMediaId, uploading, onUploadClick, onSelect, onDeleteRequest,
}: {
  kind: LianLiWirelessMediaKind;
  media: LianLiWirelessMediaItem[];
  currentMediaId: string | null;
  uploading: boolean;
  onUploadClick: () => void;
  onSelect: (item: LianLiWirelessMediaItem) => void;
  onDeleteRequest: (item: LianLiWirelessMediaItem) => void;
}) {
  const { t } = useTranslation();
  const items = media.filter(m => m.kind === kind);
  const uploadKey = kind === 'video' ? 'uploadVideo' : kind === 'gif' ? 'uploadGif' : 'uploadImage';
  const hintKey = kind === 'video' ? 'noMediaHintVideo' : kind === 'gif' ? 'noMediaHintGif' : 'noMediaHintImage';
  const Icon = kind === 'video' ? Video : kind === 'gif' ? Film : ImageIcon;

  return (
    <div className={styles.typePanel}>
      <Button size="sm" tone="neutral" disabled={uploading} onClick={onUploadClick}>
        {uploading ? t('devices.lianli-wireless.uploading') : t(`devices.lianli-wireless.${uploadKey}`)}
      </Button>
      {items.length > 0 ? (
        <div className={styles.mediaGrid}>
          {items.map(item => (
            <EffectCard
              key={item.id}
              asDiv
              label={item.name}
              thumbUrl={item.thumb}
              thumbStatic
              thumbAspect={1}
              active={item.id === currentMediaId}
              onClick={() => onSelect(item)}
              onDelete={() => onDeleteRequest(item)}
              deleteAriaLabel={t('devices.lianli-wireless.deleteMediaAria')}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Icon size={28} />}
          title={t('devices.lianli-wireless.noMediaTitle')}
          hint={t(`devices.lianli-wireless.${hintKey}`)}
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
  screen: LianLiWirelessScreen;
  onPreview: (patch: Partial<LianLiWirelessScreen>) => void;
  onCommit: (patch: LianLiWirelessScreenContentExtra) => void;
}

// Shared accent/secondary color row for the sensor, clock and animation
// panels: same two labels everywhere, the per-content-type meaning is
// documented on LianLiWirelessScreen.colorA/colorB.
function ColorPairRow({ colorA, colorB, onPreview, onCommit }: {
  colorA: string;
  colorB: string;
  onPreview: (patch: Partial<LianLiWirelessScreen>) => void;
  onCommit: (patch: LianLiWirelessScreenContentExtra) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={styles.colorPairRow}>
      <div className={styles.colorEntry}>
        <span className={styles.colorLabel}>{t('devices.lianli-wireless.colorAccentLabel')}</span>
        <HsvPicker
          value={colorA}
          onPreview={hex => onPreview({ colorA: hex })}
          onCommit={hex => onCommit({ colorA: hex })}
        />
      </div>
      <div className={styles.colorEntry}>
        <span className={styles.colorLabel}>{t('devices.lianli-wireless.colorSecondaryLabel')}</span>
        <HsvPicker
          value={colorB}
          onPreview={hex => onPreview({ colorB: hex })}
          onCommit={hex => onCommit({ colorB: hex })}
        />
      </div>
    </div>
  );
}

function SensorPanel({ screen, onPreview, onCommit }: ContentPanelProps) {
  const { t } = useTranslation();
  const source = screen.sensorSource ?? 'cpuTemp';
  const style = screen.sensorStyle ?? 'ring';
  const tempUnit = screen.tempUnit ?? 'c';
  const isTempSource = source === 'cpuTemp' || source === 'gpuTemp';

  const sourceOptions: SelectOption[] = [
    { value: 'cpuTemp', label: t('devices.lianli-wireless.sensorSourceCpuTemp') },
    { value: 'cpuLoad', label: t('devices.lianli-wireless.sensorSourceCpuLoad') },
    { value: 'gpuTemp', label: t('devices.lianli-wireless.sensorSourceGpuTemp') },
    { value: 'gpuLoad', label: t('devices.lianli-wireless.sensorSourceGpuLoad') },
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
        value={source}
        options={sourceOptions}
        onChange={v => onCommit({ sensorSource: v as LianLiWirelessScreen['sensorSource'] })}
      />
      <SettingRow label={t('devices.lianli-wireless.sensorStyleLabel')}>
        <ChipGroup
          ariaLabel={t('devices.lianli-wireless.sensorStyleLabel')}
          activeKey={style}
          onChange={v => onCommit({ sensorStyle: v as LianLiWirelessScreen['sensorStyle'] })}
          options={styleOptions}
        />
      </SettingRow>
      {isTempSource && (
        <SettingRow label={t('devices.lianli-wireless.tempUnitLabel')}>
          <ChipGroup
            ariaLabel={t('devices.lianli-wireless.tempUnitLabel')}
            activeKey={tempUnit}
            onChange={v => onCommit({ tempUnit: v as LianLiWirelessScreen['tempUnit'] })}
            options={tempUnitOptions}
          />
        </SettingRow>
      )}
      <ColorPairRow
        colorA={screen.colorA ?? DEFAULT_COLOR_A}
        colorB={screen.colorB ?? DEFAULT_COLOR_B}
        onPreview={onPreview}
        onCommit={onCommit}
      />
    </div>
  );
}

function ClockPanel({ screen, onPreview, onCommit }: ContentPanelProps) {
  const { t } = useTranslation();
  const face = screen.clockFace ?? 'digital';

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
          activeKey={face}
          onChange={v => onCommit({ clockFace: v as LianLiWirelessScreen['clockFace'] })}
          options={faceOptions}
        />
      </SettingRow>
      <ColorPairRow
        colorA={screen.colorA ?? DEFAULT_COLOR_A}
        colorB={screen.colorB ?? DEFAULT_COLOR_B}
        onPreview={onPreview}
        onCommit={onCommit}
      />
    </div>
  );
}

function AnimationPanel({ screen, onPreview, onCommit }: ContentPanelProps) {
  const { t } = useTranslation();
  const animationId = screen.animationId ?? 'pulse';

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
          activeKey={animationId}
          onChange={v => onCommit({ animationId: v as LianLiWirelessScreen['animationId'] })}
          options={animationOptions}
        />
      </SettingRow>
      {/* Spectrum generates its own rainbow and ignores the palette. */}
      {animationId !== 'spectrum' && (
        <ColorPairRow
          colorA={screen.colorA ?? DEFAULT_COLOR_A}
          colorB={screen.colorB ?? DEFAULT_ANIMATION_COLOR_B}
          onPreview={onPreview}
          onCommit={onCommit}
        />
      )}
    </div>
  );
}
