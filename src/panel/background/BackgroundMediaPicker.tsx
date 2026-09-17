import { useEffect, useRef, useState } from 'react';
import { FolderOpen, Image as ImageIcon, Sparkles, Upload } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { HoverTooltip } from '../../components/common/HoverTooltip/HoverTooltip';
import { Button } from '../../components/common/Button/Button';
import { SettingSelect, SettingToggle } from '../../components/common/SettingRow/SettingRow';
import { EffectCard } from '../../components/common/EffectCard/EffectCard';
import { EmptyState } from '../../components/common/EmptyState/EmptyState';
import { ConfirmModal } from '../../components/common/ConfirmModal/ConfirmModal';
import { MediaGrid } from '../widgets/lighting/effecteditor/MediaGrid';
import { MediaCropper, type NormalizedCrop } from '../../components/common/MediaCropper/MediaCropper';
import { KlipyPicker } from '../../components/common/KlipyPicker/KlipyPicker';
import { centerCropForAspect, serializeCrop } from '../../components/common/MediaCropper/mediaCrop';
import { useBackgroundMedia } from './useBackgroundMedia';
import {
  type BackgroundMediaItem,
  backgroundMediaStagePreviewUrl,
  cancelBackgroundMediaStage,
  commitBackgroundMedia,
  deleteBackgroundMedia,
  openBackgroundMediaFolder,
  probeBackgroundMediaStageSize,
  stageBackgroundMedia,
} from '../../api/panelBackgroundMedia';
import { importKlipyBackground, type KlipyGif } from '../../api/klipy';
import type { MediaItem } from '../../api/mediaLibrary';
import { SLIDESHOW_INTERVALS, slideshowIntervalLabel } from '../slideshow/slideshow';
import { orderBackgroundMedia } from './slideshowOrder';
import type { PanelSlideshowSettings } from '../editor/PanelThemeSettings';
import styles from '../widgets/lighting/LightingPage.module.scss';

const BG_THUMB_ASPECT = 720 / 1280;

// Mirrors PanelBgImporter's accepted extensions: the accept attribute is a
// hint the file dialog lets the user override, and each stray file otherwise
// costs an upload the service refuses.
const IMPORT_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.bmp', '.webp', '.tiff', '.tif',
  '.gif', '.mp4', '.webm', '.mov', '.avi', '.mkv', '.wmv', '.m4v', '.mpg', '.mpeg',
]);

/** Importable picks, in name order so a batch cycles the way the files read. */
function importCandidates(files: FileList | null): File[] {
  return Array.from(files ?? [])
    .filter(file => {
      const dot = file.name.lastIndexOf('.');
      return dot >= 0 && IMPORT_EXTENSIONS.has(file.name.slice(dot).toLowerCase());
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

type BatchFileOutcome = BackgroundMediaItem | 'failed' | 'unreachable';

export function BackgroundMediaPicker({
  deviceId,
  activeId,
  deviceAspect,
  deviceW,
  deviceH,
  onSelect,
  slideshow,
  onSlideshowChange,
  order = [],
  onOrderChange,
}: {
  deviceId: string;
  activeId: string | null;
  deviceAspect: number;
  deviceW: number;
  deviceH: number;
  onSelect: (mediaId: string | null, type: 'static' | 'animated' | null, alpha: boolean) => void;
  /** Slideshow controls render above the import row when this is given. In
   * slideshow mode the highlighted card is the slide the cycle starts from. */
  slideshow?: PanelSlideshowSettings;
  onSlideshowChange?: (patch: Partial<PanelSlideshowSettings>) => void;
  /** Saved grid / play order (see orderBackgroundMedia). Cards drag to reorder when `onOrderChange` is given. */
  order?: readonly string[];
  onOrderChange?: (ids: string[]) => void;
}) {
  const { t, language } = useTranslation();
  const { items, thumbs, refresh, removeLocal } = useBackgroundMedia(deviceId);
  const [importing, setImporting] = useState(false);
  const [importingName, setImportingName] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<{ n: number; total: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [cropState, setCropState] = useState<{ stageId: string; src: string; alpha: boolean } | null>(null);
  const [fitWhole, setFitWhole] = useState(false);
  const [klipyOpen, setKlipyOpen] = useState(false);
  const [klipyBusy, setKlipyBusy] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // Closing the theme sheet mid-batch unmounts this picker; the loop stops at
  // its next file rather than uploading on and selecting from a dead instance
  // over whatever the user picked meanwhile.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const adaptedItems: MediaItem[] = orderBackgroundMedia(items, order).map(item => ({
    ...item,
    fps: item.type === 'animated' ? 30 : 1,
    frames: item.type === 'animated' ? Math.max(1, Math.round(item.durationSec * 30)) : 0,
  }));

  // One file opens the cropper; several go through the batch path. Fitting the
  // whole frame leaves nothing to crop, so it skips the cropper either way.
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files;
    const files = importCandidates(picked);
    e.target.value = '';
    if (files.length === 0) {
      setImportError((picked?.length ?? 0) > 0 ? t('lighting.controls.importFolderEmpty') : null);
      return;
    }
    if (files.length > 1 || fitWhole) {
      await runImportBatch(files);
      return;
    }

    const [file] = files;
    setImportError(null);
    setImporting(true);
    setImportingName(file.name);
    const result = await stageBackgroundMedia(deviceId, file);
    if (!result || result.error) {
      setImporting(false);
      setImportingName(null);
      setImportError(result?.msg || t('lighting.controls.importFailed'));
      return;
    }
    setImporting(false);
    setImportingName(null);
    setCropState({
      stageId: result.stageId,
      src: backgroundMediaStagePreviewUrl(deviceId, result.stageId),
      alpha: result.alpha,
    });
  };

  // One batched file, start to finish: the cropper's default (largest centred
  // crop at the panel aspect) stands in for the user's crop, or the whole frame
  // when fitting. The service being unreachable ends the batch; a file it
  // refuses is counted and the rest continue.
  const importBatchFile = async (file: File): Promise<BatchFileOutcome> => {
    const staged = await stageBackgroundMedia(deviceId, file);
    if (!staged) return 'unreachable';
    if (staged.error) return 'failed';
    const size = await probeBackgroundMediaStageSize(deviceId, staged.stageId);
    if (!size) {
      cancelBackgroundMediaStage(deviceId, staged.stageId).catch(() => {});
      return 'failed';
    }
    const crop = fitWhole
      ? serializeCrop({ x: 0, y: 0, w: 1, h: 1 })
      : serializeCrop(centerCropForAspect(deviceAspect, size.w, size.h));
    const result = await commitBackgroundMedia(
      deviceId, staged.stageId, crop, deviceW, deviceH, true, fitWhole);
    if (!result || result.error || !result.item) {
      cancelBackgroundMediaStage(deviceId, staged.stageId).catch(() => {});
      return result ? 'failed' : 'unreachable';
    }
    return result.item;
  };

  const runImportBatch = async (files: File[]) => {
    setImportError(null);
    setImporting(true);
    let first: BackgroundMediaItem | null = null;
    let imported = 0;
    let failed = 0;
    let error: string | null = null;
    for (let i = 0; i < files.length; i++) {
      setImportingName(files[i].name);
      setImportProgress({ n: i + 1, total: files.length });
      const outcome = await importBatchFile(files[i]);
      if (!aliveRef.current) return;
      if (outcome === 'unreachable') {
        error = t('lighting.controls.importNetworkError');
        break;
      }
      if (outcome === 'failed') {
        failed++;
        continue;
      }
      imported++;
      if (!first) first = outcome;
    }
    if (!error && failed > 0) {
      error = t('lighting.controls.importFolderPartial', { failed, total: files.length });
    }
    setImporting(false);
    setImportingName(null);
    setImportProgress(null);
    setImportError(error);
    if (first) {
      await refresh();
      if (!aliveRef.current) return;
      onSelect(first.id, first.type, !!first.alpha);
      // Several files are imported to be cycled; one background shows one of them.
      if (imported >= 2 && slideshow && !slideshow.enabled) onSlideshowChange?.({ enabled: true });
    }
  };

  const handleCropConfirm = async (crop: NormalizedCrop, keepTransparency: boolean) => {
    if (!cropState) return;
    const { stageId } = cropState;
    const cropStr = serializeCrop(crop);
    setConverting(true);
    setImportError(null);
    const result = await commitBackgroundMedia(
      deviceId, stageId, cropStr, deviceW, deviceH, keepTransparency, false);
    setConverting(false);
    if (!result) {
      setImportError(t('lighting.controls.importNetworkError'));
      cancelBackgroundMediaStage(deviceId, stageId).catch(() => {});
      setCropState(null);
      return;
    }
    if (result.error || !result.item) {
      setImportError(result.msg || t('lighting.controls.importFailed'));
      cancelBackgroundMediaStage(deviceId, stageId).catch(() => {});
      setCropState(null);
      return;
    }
    await refresh();
    onSelect(result.item.id, result.item.type, !!result.item.alpha);
    setCropState(null);
  };

  // A pick skips staging and the cropper: the crop is the same centred one the
  // folder import uses, at the panel's aspect.
  const handleKlipyPick = async (gif: KlipyGif) => {
    setKlipyBusy(gif.slug);
    setImportError(null);
    const crop = fitWhole
      ? serializeCrop({ x: 0, y: 0, w: 1, h: 1 })
      : serializeCrop(centerCropForAspect(deviceAspect, gif.width, gif.height));
    // Transparency off: a Klipy pick fills the panel, and the alpha branch
    // bakes a palette gif at panel size instead of h264.
    const result = await importKlipyBackground(deviceId, gif.slug, crop, deviceW, deviceH, false, fitWhole);
    setKlipyBusy(null);
    if (!result) {
      setImportError(t('lighting.controls.importNetworkError'));
      return;
    }
    if (result.error || !result.item) {
      setImportError(result.msg || t('lighting.controls.importFailed'));
      return;
    }
    setKlipyOpen(false);
    await refresh();
    if (!aliveRef.current) return;
    onSelect(result.item.id, result.item.type, !!result.item.alpha);
  };

  const handleCropCancel = () => {
    if (cropState) {
      cancelBackgroundMediaStage(deviceId, cropState.stageId).catch(() => {});
    }
    setCropState(null);
    setImportError(null);
  };

  const handleGridPlay = (id: string) => {
    const selectedItem = items.find(item => item.id === id);
    if (!selectedItem) return;
    onSelect(id, selectedItem.type, !!selectedItem.alpha);
  };

  const handleDelete = async (id: string) => {
    const isActive = id === activeId;
    const nextItem = isActive ? items.filter(item => item.id !== id)[0] ?? null : null;
    const ok = await deleteBackgroundMedia(deviceId, id);
    if (!ok) { await refresh(); return; }
    removeLocal(id);
    await refresh();
    if (isActive) {
      if (nextItem) onSelect(nextItem.id, nextItem.type, !!nextItem.alpha);
      else onSelect(null, null, false);
    }
  };

  const requestDelete = (id: string, name: string) => setPendingDelete({ id, name });
  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    setPendingDelete(null);
    await handleDelete(id);
  };

  const importingLabel = importProgress
    ? t('lighting.controls.importingCount', importProgress)
    : t('lighting.controls.importing');

  const slideshowControls = slideshow && (
    <>
      <SettingToggle
        label={t('panel.settings.slideshow')}
        description={t('panel.settings.slideshow.desc')}
        checked={slideshow.enabled}
        onChange={enabled => onSlideshowChange?.({ enabled })}
      />
      {slideshow.enabled && (
        <SettingSelect
          label={t('slideshow.interval')}
          value={String(slideshow.interval)}
          options={SLIDESHOW_INTERVALS.map(seconds => ({
            value: String(seconds),
            label: slideshowIntervalLabel(t, language, seconds),
          }))}
          onChange={value => onSlideshowChange?.({ interval: Number(value) })}
        />
      )}
      {slideshow.enabled && (
        <SettingToggle
          label={t('slideshow.shuffle')}
          checked={slideshow.shuffle}
          onChange={shuffle => onSlideshowChange?.({ shuffle })}
        />
      )}
      {slideshow.enabled && (
        <SettingToggle
          label={t('slideshow.finishVideos')}
          description={t('slideshow.finishVideosHint')}
          checked={slideshow.finishVideos}
          onChange={finishVideos => onSlideshowChange?.({ finishVideos })}
        />
      )}
    </>
  );

  const fitControl = (
    <SettingToggle
      label={t('panel.background.fitWhole')}
      description={t('panel.background.fitWhole.desc')}
      checked={fitWhole}
      onChange={setFitWhole}
    />
  );

  return (
    <>
      {cropState && (
        <MediaCropper
          src={cropState.src}
          aspect={deviceAspect}
          busy={converting}
          allowTransparency={cropState.alpha}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
      <div className={styles.mediaSection}>
        {slideshowControls}
        {fitControl}
        <div className={styles.mediaHeader}>
          <Button
            type="button"
            icon={<Upload size={16} aria-hidden />}
            onClick={() => fileRef.current?.click()}
            disabled={importing}
          >
            {importing ? t('lighting.controls.importing') : t('lighting.controls.import')}
          </Button>
          <Button
            type="button"
            icon={<Sparkles size={16} aria-hidden />}
            onClick={() => setKlipyOpen(true)}
            disabled={importing}
          >
            {t('lighting.controls.klipyBrowse')}
          </Button>
          <HoverTooltip body={t('lighting.controls.mediaManageFolder')} side="bottom">
            <Button
              className={styles.manageFolderBtn}
              icon={<FolderOpen size={16} aria-hidden />}
              onClick={() => { openBackgroundMediaFolder(deviceId).catch(() => {}); }}
            >
              {t('lighting.controls.mediaManageFolder')}
            </Button>
          </HoverTooltip>
          <input
            ref={fileRef}
            type="file"
            className={styles.hiddenInput}
            accept="image/*,video/*,.gif"
            multiple
            onChange={handleImport}
          />
        </div>
        <KlipyPicker
          open={klipyOpen}
          busySlug={klipyBusy}
          importError={klipyOpen ? importError : null}
          thumbAspect={deviceAspect}
          onPick={handleKlipyPick}
          onClose={() => { setKlipyOpen(false); setImportError(null); }}
        />
        {importError && !klipyOpen && <p className={styles.mediaError}>{importError}</p>}
        {items.length === 0 && !importing && !importError && (
          <EmptyState
            className={styles.mediaEmpty}
            icon={<ImageIcon size={22} />}
            title={t('lighting.controls.noMediaTitle')}
            hint={t('lighting.controls.noMedia')}
          />
        )}
        <ConfirmModal
          open={pendingDelete !== null}
          title={t('lighting.controls.mediaDeleteTitle')}
          message={t('lighting.controls.mediaDeleteMessage', { name: pendingDelete?.name ?? '' })}
          note={t('lighting.controls.mediaDeleteNote')}
          confirmLabel={t('lighting.controls.mediaDeleteConfirm')}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
        <MediaGrid
          items={adaptedItems}
          activeId={activeId}
          thumbs={thumbs}
          onPlay={handleGridPlay}
          onDelete={requestDelete}
          deleteAriaLabel={t('lighting.controls.mediaDelete')}
          thumbAspect={BG_THUMB_ASPECT}
          onReorder={onOrderChange}
          prepend={importingName ? (
            <EffectCard
              asDiv
              label={importingName.replace(/\.[^.]+$/, '')}
              thumbUrl={null}
              active={false}
              onClick={() => { /* importing */ }}
              meta={importingLabel}
              thumbOverlay={<span className={styles.mediaSpinner} role="status" aria-label={importingLabel} />}
              ariaLabel={importingName}
              thumbAspect={BG_THUMB_ASPECT}
            />
          ) : undefined}
        />
      </div>
    </>
  );
}
