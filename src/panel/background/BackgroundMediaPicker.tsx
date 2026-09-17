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
import { serializeCrop } from '../../components/common/MediaCropper/mediaCrop';
import { useBackgroundMedia } from './useBackgroundMedia';
import {
  type BackgroundMediaItem,
  backgroundMediaStagePreviewUrl,
  backgroundMediaStageRawUrl,
  cancelBackgroundMediaStage,
  commitBackgroundMedia,
  deleteBackgroundMedia,
  openBackgroundMediaFolder,
  stageBackgroundMedia,
} from '../../api/panelBackgroundMedia';
import { stageKlipyBackground, type KlipyGif } from '../../api/klipy';
import { stagePreviewFor, type MediaItem } from '../../api/mediaLibrary';
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
  const [cropState, setCropState] = useState<{ stageId: string; src: string; kind: 'video' | 'image'; fallbackSrc: string; alpha: boolean } | null>(null);
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

  // Every import goes through the cropper, one file at a time: a selection is
  // a queue, and each confirm or cancel stages the next. The tally decides
  // what to select and whether to start a slideshow once the queue is empty.
  const queueRef = useRef<File[]>([]);
  const batchRef = useRef({ total: 0, imported: 0, failed: 0, first: null as BackgroundMediaItem | null });

  const finishBatch = async () => {
    const { total, imported, failed, first } = batchRef.current;
    setImporting(false);
    setImportingName(null);
    setImportProgress(null);
    setImportError(failed > 0 ? t('lighting.controls.importFolderPartial', { failed, total }) : null);
    if (!first) return;
    await refresh();
    if (!aliveRef.current) return;
    onSelect(first.id, first.type, !!first.alpha);
    // Several files are imported to be cycled; one background shows one of them.
    if (imported >= 2 && slideshow && !slideshow.enabled) onSlideshowChange?.({ enabled: true });
  };

  // Stages the next queued file and opens the cropper on it. A file the
  // service refuses is counted and the queue moves on; an unreachable service
  // ends the batch.
  const stageNext = async (): Promise<void> => {
    const file = queueRef.current.shift();
    if (!file) { await finishBatch(); return; }
    const { total } = batchRef.current;
    const n = total - queueRef.current.length;
    setImporting(true);
    setImportingName(file.name);
    setImportProgress(total > 1 ? { n, total } : null);
    const staged = await stageBackgroundMedia(deviceId, file);
    if (!aliveRef.current) {
      // Unmounted mid-upload: nothing will commit this stage, so drop it now
      // rather than leave the raw waiting for the next sweep.
      if (staged && !staged.error) cancelBackgroundMediaStage(deviceId, staged.stageId).catch(() => {});
      return;
    }
    if (!staged) {
      queueRef.current = [];
      batchRef.current.failed += 1;
      await finishBatch();
      setImportError(t('lighting.controls.importNetworkError'));
      return;
    }
    if (staged.error) {
      batchRef.current.failed += 1;
      await stageNext();
      return;
    }
    setImporting(false);
    setImportingName(null);
    setCropState({
      stageId: staged.stageId,
      ...stagePreviewFor(
        staged.mediaKind,
        backgroundMediaStageRawUrl(deviceId, staged.stageId),
        backgroundMediaStagePreviewUrl(deviceId, staged.stageId)),
      alpha: !!staged.alpha,
    });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files;
    const files = importCandidates(picked);
    e.target.value = '';
    if (files.length === 0) {
      setImportError((picked?.length ?? 0) > 0 ? t('lighting.controls.importFolderEmpty') : null);
      return;
    }
    setImportError(null);
    queueRef.current = files;
    batchRef.current = { total: files.length, imported: 0, failed: 0, first: null };
    await stageNext();
  };

  // A pick is staged like an upload, then cropped the same way.
  const handleKlipyPick = async (gif: KlipyGif) => {
    setKlipyBusy(gif.slug);
    setImportError(null);
    const staged = await stageKlipyBackground(deviceId, gif.slug);
    setKlipyBusy(null);
    if (!staged) {
      setImportError(t('lighting.controls.importNetworkError'));
      return;
    }
    // A refusal here is Klipy's (no file, no such clip, over the cap), not
    // the service's - say so, or it reads as a Nexus fault.
    if (staged.error || !staged.stageId) {
      setImportError(t('lighting.controls.klipyPickFailed'));
      return;
    }
    setKlipyOpen(false);
    queueRef.current = [];
    batchRef.current = { total: 1, imported: 0, failed: 0, first: null };
    setCropState({
      stageId: staged.stageId,
      ...stagePreviewFor(
        staged.mediaKind,
        backgroundMediaStageRawUrl(deviceId, staged.stageId),
        backgroundMediaStagePreviewUrl(deviceId, staged.stageId)),
      alpha: !!staged.alpha,
    });
  };

  const handleCropConfirm = async (crop: NormalizedCrop, keepTransparency: boolean, fit: boolean) => {
    if (!cropState) return;
    const { stageId } = cropState;
    setConverting(true);
    setImportError(null);
    const result = await commitBackgroundMedia(
      deviceId, stageId, serializeCrop(crop), deviceW, deviceH, keepTransparency, fit);
    // A refused or unanswered commit leaves the stage behind whether or not
    // this picker is still mounted.
    if (!result || result.error || !result.item) cancelBackgroundMediaStage(deviceId, stageId).catch(() => {});
    setConverting(false);
    if (!aliveRef.current) return;
    setCropState(null);
    if (!result) {
      queueRef.current = [];
      batchRef.current.failed += 1;
      await finishBatch();
      setImportError(t('lighting.controls.importNetworkError'));
      return;
    }
    if (result.error || !result.item) {
      batchRef.current.failed += 1;
      if (batchRef.current.total === 1) {
        await finishBatch();
        setImportError(result.msg || t('lighting.controls.importFailed'));
        return;
      }
      await stageNext();
      return;
    }
    batchRef.current.imported += 1;
    batchRef.current.first ??= result.item;
    await stageNext();
  };

  // Cancelling skips this file; the rest of the selection still gets its turn.
  const handleCropCancel = async () => {
    if (cropState) {
      cancelBackgroundMediaStage(deviceId, cropState.stageId).catch(() => {});
    }
    setCropState(null);
    setImportError(null);
    await stageNext();
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

  return (
    <>
      {cropState && (
        <MediaCropper
          src={cropState.src}
          kind={cropState.kind}
          fallbackSrc={cropState.fallbackSrc}
          aspect={deviceAspect}
          busy={converting}
          allowTransparency={cropState.alpha}
          allowFit
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
      <div className={styles.mediaSection}>
        {slideshowControls}
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
