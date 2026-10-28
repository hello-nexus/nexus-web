import { useEffect, useMemo, useRef, useState } from 'react';
import { useToastSafe } from '../../../components/common/Toast/Toast';
import { Sparkles, Shapes, Smile, ImagePlus } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { IconLabelButton } from '../../../components/common/IconLabelButton/IconLabelButton';
import { SearchInput } from '../../../components/common/SearchInput/SearchInput';
import { Button } from '../../../components/common/Button/Button';
import { MediaCropper, type NormalizedCrop } from '../../../components/common/MediaCropper/MediaCropper';
import { canEditFreeText, type PanelSurface } from '../../types';
import { DECK_ICONS, DECK_ICON_NAMES } from '../deck/deckIcons';
import { EmojiPicker } from './EmojiPicker';
import { useDeckImage } from '../deck/useDeckImage';
import { resizeDeckImage } from '../deck/resizeDeckImage';
import { DeckImageMedia } from '../deck/DeckImageMedia';
import { classifyDeckFile, isDeckAnimatedTooLarge, probeVideoDecodes, DECK_ANIMATED_MAX_MB } from '../deck/deckMedia';
import { KlipyPicker } from '../../../components/common/KlipyPicker/KlipyPicker';
import { serializeCrop } from '../../../components/common/MediaCropper/mediaCrop';
import { uploadDeckImage, uploadDeckAnimated, commitDeckKlipyStage, type DeckImageResult } from '../../../api/deckImages';
import { stageKlipy, type KlipyGif } from '../../../api/klipy';
import { cancelMediaStage, mediaStagePreviewUrl, mediaStageRawUrl, stagePreviewFor } from '../../../api/mediaLibrary';
import type { DeckIcon } from '../deck/types';
import styles from './IconPicker.module.scss';
import { HoverTooltip } from '../../../components/common/HoverTooltip/HoverTooltip';

const TAB_DEFS = [
  { key: 'auto', icon: Sparkles, labelKey: 'panel.iconPicker.auto' },
  { key: 'icons', icon: Shapes, labelKey: 'panel.iconPicker.icons' },
  { key: 'emoji', icon: Smile, labelKey: 'panel.iconPicker.emoji' },
  { key: 'custom', icon: ImagePlus, labelKey: 'panel.iconPicker.custom' },
] as const;

interface IconPickerProps {
  value?: DeckIcon;
  onChange: (icon: DeckIcon | undefined) => void;
  // Present when the slot launches an app; the Auto tab then shows the app's icon.
  appId?: string;
  // Surface being edited; the icon-name search is hidden on keyboard-less
  // surfaces (Y70 / Q-series). Undefined falls back to showing it.
  surface?: PanelSurface;
  // True when rendered in a desktop editor context; keeps the search input
  // visible even when the target surface has no keyboard.
  desktopEditor?: boolean;
}

export type Tab = 'auto' | 'icons' | 'emoji' | 'custom';

export function tabForValue(value?: DeckIcon): Tab {
  if (value?.kind === 'lucide') return 'icons';
  if (value?.kind === 'emoji') return 'emoji';
  if (value?.kind === 'image') return 'custom';
  return 'auto'; // undefined or app icon → Auto
}

export function IconPicker({ value, onChange, surface, desktopEditor }: IconPickerProps) {
  const { t } = useTranslation();
  const { push } = useToastSafe();
  const [tab, setTab] = useState<Tab>(() => tabForValue(value));
  const [query, setQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Object URL of the picked file while the cropper is open.
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  useEffect(() => (cropSrc ? () => URL.revokeObjectURL(cropSrc) : undefined), [cropSrc]);
  const [animCrop, setAnimCrop] = useState<{ src: string; kind: 'image' | 'video'; fallbackSrc?: string; file?: File; stageId?: string } | null>(null);
  useEffect(() => (animCrop?.file ? () => URL.revokeObjectURL(animCrop.src) : undefined), [animCrop]);
  const [klipyOpen, setKlipyOpen] = useState(false);
  const [klipyBusy, setKlipyBusy] = useState<string | null>(null);
  const [klipyError, setKlipyError] = useState<string | null>(null);
  const aliveRef = useRef(true);
  const stageRef = useRef<string | null>(null);
  stageRef.current = animCrop?.stageId ?? null;
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (stageRef.current) cancelMediaStage(stageRef.current).catch(() => {});
    };
  }, []);
  const fileRef = useRef<HTMLInputElement>(null);
  const showSearch = canEditFreeText(surface, desktopEditor);
  const { url: previewUrl, isVideo: previewIsVideo } = useDeckImage(value?.kind === 'image' ? value.value : undefined);

  // Remembers the last uploaded/selected image id across a round trip through
  // Auto (or any other tab) and back to Custom, so switching away and back
  // doesn't read as "the image was cleared".
  const lastImageId = useRef<string | undefined>(value?.kind === 'image' ? value.value : undefined);
  if (value?.kind === 'image') lastImageId.current = value.value;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? DECK_ICON_NAMES.filter(n => n.toLowerCase().includes(q)) : DECK_ICON_NAMES;
  }, [query]);

  const onTab = (key: string) => {
    const k = key as Tab;
    setTab(k);
    if (k === 'auto') { onChange(undefined); return; } // Auto = no explicit icon (derives from the action / app)
    if (k === 'custom' && value?.kind !== 'image' && lastImageId.current) {
      onChange({ kind: 'image', value: lastImageId.current });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploadError(null);
    const kind = classifyDeckFile(file);
    if (kind === 'still') { setCropSrc(URL.createObjectURL(file)); return; }
    if (kind === 'unsupportedVideo') { setUploadError(t('panel.iconPicker.unsupportedFile')); return; }
    if (isDeckAnimatedTooLarge(file.size)) {
      setUploadError(t('panel.iconPicker.fileTooLarge', { limit: DECK_ANIMATED_MAX_MB }));
      return;
    }
    void handleAnimatedPick(file, kind === 'video');
  };

  const handleAnimatedPick = async (file: File, isVideo: boolean) => {
    setUploading(true);
    try {
      if (isVideo && !(await probeVideoDecodes(file))) {
        setUploadError(t('panel.iconPicker.videoUndecodable'));
        return;
      }
      setAnimCrop({ src: URL.createObjectURL(file), kind: isVideo ? 'video' : 'image', file });
    } finally {
      setUploading(false);
    }
  };

  const handleAnimConfirm = async (crop: NormalizedCrop) => {
    if (!animCrop) return;
    const { file, stageId } = animCrop;
    setUploading(true);
    let result: DeckImageResult = { failure: 'failed' };
    try {
      const wire = serializeCrop(crop);
      if (file) result = await uploadDeckAnimated(file, wire);
      else if (stageId) result = await commitDeckKlipyStage(stageId, wire);
    } catch {
      // result stays failed
    }
    if ('id' in result) {
      onChange({ kind: 'image', value: result.id });
    } else if (result.failure === 'busy') {
      push({ title: t('panel.iconPicker.busy') });
      setUploading(false);
      return;
    } else {
      if (stageId && result.failure !== 'expired') cancelMediaStage(stageId).catch(() => {});
      setUploadError(t(
        result.failure === 'tooLarge' ? 'panel.iconPicker.resultTooLarge'
          : result.failure === 'expired' ? 'panel.iconPicker.stageExpired'
          : 'panel.iconPicker.uploadFailed'));
    }
    setUploading(false);
    setAnimCrop(null);
  };

  const handleAnimCancel = () => {
    if (animCrop?.stageId) cancelMediaStage(animCrop.stageId).catch(() => {});
    setAnimCrop(null);
  };

  const handleKlipyPick = async (gif: KlipyGif) => {
    setKlipyBusy(gif.slug);
    setKlipyError(null);
    const staged = await stageKlipy(gif.slug);
    if (!aliveRef.current) {
      if (staged?.stageId) cancelMediaStage(staged.stageId).catch(() => {});
      return;
    }
    setKlipyBusy(null);
    if (!staged) { setKlipyError(t('lighting.controls.importNetworkError')); return; }
    if (staged.error || !staged.stageId) { setKlipyError(t('lighting.controls.klipyPickFailed')); return; }
    setKlipyOpen(false);
    setUploadError(null);
    setAnimCrop({
      stageId: staged.stageId,
      ...stagePreviewFor(staged.mediaKind, mediaStageRawUrl(staged.stageId), mediaStagePreviewUrl(staged.stageId)),
    });
  };

  const handleCropConfirm = async (crop: NormalizedCrop, fit: boolean) => {
    if (!cropSrc) return;
    setUploading(true);
    try {
      const resized = await resizeDeckImage(cropSrc, crop, fit);
      const id = await uploadDeckImage(resized);
      if (!id) { setUploadError(t('panel.iconPicker.uploadFailed')); return; }
      onChange({ kind: 'image', value: id });
    } catch {
      setUploadError(t('panel.iconPicker.uploadFailed'));
    } finally {
      setUploading(false);
      setCropSrc(null);
    }
  };

  return (
    <div className={styles.picker}>
      <div className={styles.tabRow} role="tablist" aria-label={t('panel.settings.icon')}>
        {TAB_DEFS.map(({ key, icon: Icon, labelKey }) => (
          <IconLabelButton
            key={key}
            active={tab === key}
            icon={<Icon aria-hidden="true" />}
            label={t(labelKey)}
            onPress={() => onTab(key)}
          />
        ))}
      </div>

      {tab === 'auto' && (
        <div className={styles.autoHint}>{t('panel.iconPicker.autoHint')}</div>
      )}

      {tab === 'icons' && (
        <>
          {showSearch && (
            <SearchInput
              className={styles.search}
              value={query}
              onChange={setQuery}
              placeholder={t('panel.iconPicker.search')}
              ariaLabel={t('panel.iconPicker.search')}
            />
          )}
          <div className={styles.grid} data-panel-scrollable="true">
            {filtered.map(name => {
              const Comp = DECK_ICONS[name];
              const active = value?.kind === 'lucide' && value.value === name;
              return (
                <HoverTooltip key={name} body={name}>
                  <button
                    type="button"
                    aria-label={name}
                    className={`${styles.iconBtn} ${active ? styles.activeIcon : ''}`}
                    onClick={() => onChange({ kind: 'lucide', value: name })}
                  >
                    <Comp aria-hidden="true" />
                  </button>
                </HoverTooltip>
              );
            })}
          </div>
        </>
      )}

      {tab === 'emoji' && (
        <EmojiPicker
          value={value?.kind === 'emoji' ? value.value : undefined}
          onSelect={emoji => onChange({ kind: 'emoji', value: emoji })}
          searchable={showSearch}
        />
      )}

      {tab === 'custom' && (
        <div className={styles.customTab}>
          {value?.kind === 'image' && (
            <div className={styles.customPreview}>
              {previewUrl
                ? <DeckImageMedia url={previewUrl} isVideo={previewIsVideo} className={styles.customPreviewImg} />
                : <span className={styles.customPreviewSkeleton} aria-hidden="true" />}
            </div>
          )}
          <div className={styles.uploadRow}>
            <Button type="button" tone="neutral" size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>
              {t('panel.iconPicker.uploadImage')}
            </Button>
            <Button type="button" tone="neutral" size="sm" icon={<Sparkles size={16} aria-hidden />} disabled={uploading} onClick={() => setKlipyOpen(true)}>
              {t('lighting.controls.klipyBrowse')}
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/mp4,video/webm"
            className={styles.hiddenInput}
            onChange={handleFileChange}
          />
          {!value && !uploading && <div className={styles.autoHint}>{t('panel.iconPicker.customHint')}</div>}
          {uploadError && <div className={styles.uploadError}>{uploadError}</div>}
        </div>
      )}

      {animCrop && (
        <MediaCropper
          src={animCrop.src}
          kind={animCrop.kind}
          fallbackSrc={animCrop.fallbackSrc}
          aspect={1}
          busy={uploading}
          onConfirm={crop => void handleAnimConfirm(crop)}
          onCancel={handleAnimCancel}
        />
      )}

      <KlipyPicker
        open={klipyOpen}
        busySlug={klipyBusy}
        importError={klipyOpen ? klipyError : null}
        thumbAspect={1}
        onPick={gif => void handleKlipyPick(gif)}
        onClose={() => { setKlipyOpen(false); setKlipyError(null); }}
      />

      {cropSrc && (
        <MediaCropper
          src={cropSrc}
          aspect={1}
          allowFit
          busy={uploading}
          onConfirm={(crop, _keepTransparency, fit) => void handleCropConfirm(crop, fit)}
          onCancel={() => setCropSrc(null)}
        />
      )}
    </div>
  );
}
