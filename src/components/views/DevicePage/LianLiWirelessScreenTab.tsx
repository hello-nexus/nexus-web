import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MonitorOff, Image as ImageIcon, Film, Video, Gauge, Clock, Sparkles, Layers,
} from 'lucide-react';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { ChipGroup, type ChipOption } from '../../common/ChipGroup/ChipGroup';
import { Select, type SelectOption } from '../../common/Select/Select';
import { Slider } from '../../common/Slider/Slider';
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
  type LianLiWirelessMediaItem,
  type LianLiWirelessMediaKind,
} from '../../../api/lianli-wireless';
import { useTranslation } from '../../../lib/i18n';
import styles from './LianLiWirelessDevicePage.module.scss';

const SCREENS_POLL_MS = 2000;
const GROUP_ALL = 'all';

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
 * fan screens. Screens are addressed individually (by serial) or as a group
 * (`GROUP_ALL`) that broadcasts the next change to every screen. Polls its
 * own `/screens` list independently of the shell's fan-state poll.
 */
export function LianLiWirelessScreenTab() {
  const { t } = useTranslation();
  const [screens, setScreens] = useState<LianLiWirelessScreen[] | null>(null);
  const [media, setMedia] = useState<LianLiWirelessMediaItem[]>([]);
  const [target, setTarget] = useState<string | null>(null);
  const [brightnessDraft, setBrightnessDraft] = useState(50);
  const [uploadKind, setUploadKind] = useState<LianLiWirelessMediaKind>('image');
  const [uploading, setUploading] = useState(false);
  const [cropState, setCropState] = useState<{ src: string; file: File } | null>(null);
  const [pendingDeleteMedia, setPendingDeleteMedia] = useState<LianLiWirelessMediaItem | null>(null);

  const aliveRef = useRef(true);
  const brightnessInteractingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refreshScreens = useCallback(async () => {
    const s = await getLianLiWirelessScreens();
    if (aliveRef.current) setScreens(s);
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

  // Default the selection to the first (by position) screen once the list
  // first loads; never overrides a selection the user already made.
  useEffect(() => {
    if (target === null && orderedScreens.length > 0) setTarget(orderedScreens[0].serial);
  }, [orderedScreens, target]);
  const targetScreens = target === GROUP_ALL
    ? orderedScreens
    : orderedScreens.filter(s => s.serial === target);
  // The screen(s) a control edit applies to. In group mode every screen is
  // targeted; the FIRST one's current value is shown as the representative
  // state (screens are expected to converge to the same settings in group use).
  const representative = targetScreens[0] ?? null;

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
    const serials = (target === GROUP_ALL ? screens : screens.filter(s => s.serial === target))
      .map(s => s.serial);
    setScreens(prev => prev ? prev.map(s => (serials.includes(s.serial) ? mutate(s) : s)) : prev);
    for (const serial of serials) dispatch(serial);
  }, [screens, target]);

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

  const handleCropConfirm = useCallback((crop: NormalizedCrop) => {
    if (!cropState) return;
    const { file, src } = cropState;
    setCropState(null);
    setUploading(true);
    void (async () => {
      try {
        await importLianLiWirelessMedia(file, crop);
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

  const contentTypeOptions: SelectOption[] = CONTENT_TYPES.map(ct => ({
    value: ct.value,
    label: t(ct.labelKey),
  }));

  const screenChips: ChipOption[] = orderedScreens.map(s => ({
    key: s.serial,
    label: t('devices.lianli-wireless.fanN', { n: s.position }),
  }));
  screenChips.push({ key: GROUP_ALL, label: t('devices.lianli-wireless.screenGroupAll') });

  return (
    <>
      <SettingsSection
        title={t('devices.lianli-wireless.screensSection')}
        boxClassName={styles.sectionBox}
      >
        <div className={styles.screenSelectorRow}>
          <ChipGroup
            ariaLabel={t('devices.lianli-wireless.screensAria')}
            activeKey={target ?? ''}
            onChange={setTarget}
            options={screenChips}
          />
        </div>
        {/* Read-only glance strip: the ChipGroup above is the actual selector,
            this only mirrors each screen's live content/brightness/rotation. */}
        <div className={styles.screenPreviewGrid} aria-hidden="true">
          {orderedScreens.map(s => (
            <div
              key={s.serial}
              className={`${styles.screenPreviewTile} ${target === s.serial ? styles.screenPreviewTileActive : ''}`}
            >
              <span
                className={styles.screenPreviewThumb}
                style={{ transform: `rotate(${s.rotation * 90}deg)`, opacity: 0.3 + (s.brightness / 100) * 0.7 }}
              >
                {contentTypeIcon(s.contentType)}
              </span>
              <span className={styles.screenPreviewLabel}>
                {t('devices.lianli-wireless.fanN', { n: s.position })}
              </span>
            </div>
          ))}
          {target === GROUP_ALL && (
            <div className={`${styles.screenPreviewTile} ${styles.screenPreviewTileActive}`}>
              <span className={styles.screenPreviewThumb}>
                <Layers size={20} />
              </span>
              <span className={styles.screenPreviewLabel}>
                {t('devices.lianli-wireless.screenGroupAll')}
              </span>
            </div>
          )}
        </div>
        {!loaded && <p className={styles.emptyNote}>{t('devices.lianli-wireless.loadingScreens')}</p>}
        {loaded && orderedScreens.length === 0 && (
          <p className={styles.emptyNote}>{t('devices.lianli-wireless.noScreens')}</p>
        )}
      </SettingsSection>

      <SettingsSection
        title={t('devices.lianli-wireless.contentSection')}
        boxClassName={styles.sectionBox}
      >
        <div className={`${styles.contentTypeRow} ${!representative ? styles.rowDisabled : ''}`}>
          <Select
            className={styles.contentTypeSelect}
            value={representative?.contentType ?? 'off'}
            options={contentTypeOptions}
            disabled={!representative}
            onChange={v => handleContentTypeChange(v as LianLiWirelessScreenContentType)}
            ariaLabel={t('devices.lianli-wireless.contentTypeAria')}
          />
        </div>

        {representative?.contentType === 'image' && (
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
        {representative?.contentType === 'gif' && (
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
        {representative?.contentType === 'video' && (
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
        {representative?.contentType === 'sensor' && <SensorPanel />}
        {representative?.contentType === 'clock' && <ClockPanel />}
        {representative?.contentType === 'animation' && <AnimationPanel />}

        <input
          ref={fileInputRef}
          type="file"
          accept={acceptForKind(uploadKind)}
          className={styles.hiddenInput}
          onChange={handleFileChange}
        />
      </SettingsSection>

      <SettingsSection
        title={t('devices.lianli-wireless.displaySection')}
        boxClassName={styles.sectionBox}
      >
        <div className={`${styles.sliderBlock} ${!representative ? styles.rowDisabled : ''}`}>
          <Slider
            // eslint-disable-next-line i18next/no-literal-string -- slider layout enum
            orientation="stacked"
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
        </div>
        <div className={`${styles.row} ${!representative ? styles.rowDisabled : ''}`}>
          <span className={styles.rowLabel}>{t('devices.lianli-wireless.rotationLabel')}</span>
          <ChipGroup
            ariaLabel={t('devices.lianli-wireless.rotationLabel')}
            activeKey={String(representative?.rotation ?? 0)}
            onChange={v => handleRotationChange(Number(v))}
            options={ROTATIONS.map(r => ({
              key: String(r),
              label: t('devices.lianli-wireless.rotationDegrees', { n: r * 90 }),
            }))}
          />
        </div>
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
              thumbUrl={null}
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

function SensorPanel() {
  const { t } = useTranslation();
  const [source, setSource] = useState('cpuTemp');
  const [style, setStyle] = useState('digits');
  const [color, setColor] = useState('#ffffff');

  const sourceOptions: SelectOption[] = [
    { value: 'cpuTemp', label: t('devices.lianli-wireless.sensorSourceCpuTemp') },
    { value: 'cpuLoad', label: t('devices.lianli-wireless.sensorSourceCpuLoad') },
    { value: 'gpuTemp', label: t('devices.lianli-wireless.sensorSourceGpuTemp') },
    { value: 'gpuLoad', label: t('devices.lianli-wireless.sensorSourceGpuLoad') },
    { value: 'fanRpm', label: t('devices.lianli-wireless.sensorSourceFanRpm') },
  ];
  const styleOptions: SelectOption[] = [
    { value: 'digits', label: t('devices.lianli-wireless.sensorStyleDigits') },
    { value: 'gauge', label: t('devices.lianli-wireless.sensorStyleGauge') },
    { value: 'bar', label: t('devices.lianli-wireless.sensorStyleBar') },
  ];

  return (
    <div className={styles.typePanel}>
      <p className={styles.comingSoon}>{t('devices.lianli-wireless.comingSoon')}</p>
      <div className={`${styles.row} ${styles.rowDisabled}`}>
        <span className={styles.rowLabel}>{t('devices.lianli-wireless.sensorSourceLabel')}</span>
        <Select
          value={source}
          options={sourceOptions}
          onChange={setSource}
          disabled
          ariaLabel={t('devices.lianli-wireless.sensorSourceLabel')}
        />
      </div>
      <div className={`${styles.row} ${styles.rowDisabled}`}>
        <span className={styles.rowLabel}>{t('devices.lianli-wireless.sensorStyleLabel')}</span>
        <Select
          value={style}
          options={styleOptions}
          onChange={setStyle}
          disabled
          ariaLabel={t('devices.lianli-wireless.sensorStyleLabel')}
        />
      </div>
      <div className={`${styles.sliderBlock} ${styles.rowDisabled}`}>
        <span className={styles.rowLabel}>{t('devices.lianli-wireless.colorLabel')}</span>
        <HsvPicker value={color} onPreview={setColor} onCommit={setColor} />
      </div>
    </div>
  );
}

function ClockPanel() {
  const { t } = useTranslation();
  const [face, setFace] = useState('analog');
  const [color, setColor] = useState('#ffffff');

  const faceOptions: SelectOption[] = [
    { value: 'analog', label: t('devices.lianli-wireless.clockFaceAnalog') },
    { value: 'digital', label: t('devices.lianli-wireless.clockFaceDigital') },
    { value: 'digitalDate', label: t('devices.lianli-wireless.clockFaceDigitalDate') },
  ];

  return (
    <div className={styles.typePanel}>
      <p className={styles.comingSoon}>{t('devices.lianli-wireless.comingSoon')}</p>
      <div className={`${styles.row} ${styles.rowDisabled}`}>
        <span className={styles.rowLabel}>{t('devices.lianli-wireless.clockFaceLabel')}</span>
        <Select
          value={face}
          options={faceOptions}
          onChange={setFace}
          disabled
          ariaLabel={t('devices.lianli-wireless.clockFaceLabel')}
        />
      </div>
      <div className={`${styles.sliderBlock} ${styles.rowDisabled}`}>
        <span className={styles.rowLabel}>{t('devices.lianli-wireless.colorLabel')}</span>
        <HsvPicker value={color} onPreview={setColor} onCommit={setColor} />
      </div>
    </div>
  );
}

const ANIMATION_OPTIONS = [1, 2, 3, 4];

function AnimationPanel() {
  const { t } = useTranslation();
  return (
    <div className={styles.typePanel}>
      <p className={styles.comingSoon}>{t('devices.lianli-wireless.comingSoon')}</p>
      <div className={`${styles.mediaGrid} ${styles.rowDisabled}`}>
        {ANIMATION_OPTIONS.map(n => (
          <EffectCard
            key={n}
            asDiv
            label={t('devices.lianli-wireless.animationOption', { n })}
            thumbUrl={null}
            thumbStatic
            thumbAspect={1}
            active={false}
            onClick={() => {}}
          />
        ))}
      </div>
    </div>
  );
}
