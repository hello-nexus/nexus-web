import { useEffect, useRef, useState } from 'react';
import { FolderInput, FolderOpen, Image as ImageIcon, Upload } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { HoverTooltip } from '../../components/common/HoverTooltip/HoverTooltip';
import { Button } from '../../components/common/Button/Button';
import { EffectCard } from '../../components/common/EffectCard/EffectCard';
import { EmptyState } from '../../components/common/EmptyState/EmptyState';
import { ConfirmModal } from '../../components/common/ConfirmModal/ConfirmModal';
import { MediaGrid } from '../widgets/lighting/effecteditor/MediaGrid';
import { MediaCropper, type NormalizedCrop } from '../../components/common/MediaCropper/MediaCropper';
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
import type { MediaItem } from '../../api/mediaLibrary';
import styles from '../widgets/lighting/LightingPage.module.scss';

const BG_THUMB_ASPECT = 720 / 1280;

// Mirrors PanelBgImporter's accepted extensions so a folder's stray files
// (sidecars, thumbnails, documents) are skipped here instead of each costing
// an upload the service rejects.
const FOLDER_IMPORT_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.bmp', '.webp', '.tiff', '.tif',
  '.gif', '.mp4', '.webm', '.mov', '.avi', '.mkv', '.wmv', '.m4v', '.mpg', '.mpeg',
]);

function folderImportCandidates(files: FileList | null): File[] {
  return Array.from(files ?? [])
    .filter(file => {
      const dot = file.name.lastIndexOf('.');
      return dot >= 0 && FOLDER_IMPORT_EXTENSIONS.has(file.name.slice(dot).toLowerCase());
    })
    .sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, undefined, { numeric: true }));
}

type FolderFileOutcome = BackgroundMediaItem | 'failed' | 'unreachable';

export function BackgroundMediaPicker({
  deviceId,
  activeId,
  deviceAspect,
  deviceW,
  deviceH,
  onSelect,
}: {
  deviceId: string;
  activeId: string | null;
  deviceAspect: number;
  deviceW: number;
  deviceH: number;
  onSelect: (mediaId: string | null, type: 'static' | 'animated' | null, alpha: boolean) => void;
}) {
  const { t } = useTranslation();
  const { items, thumbs, refresh, removeLocal } = useBackgroundMedia(deviceId);
  const [importing, setImporting] = useState(false);
  const [importingName, setImportingName] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<{ n: number; total: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [cropState, setCropState] = useState<{ stageId: string; src: string; alpha: boolean } | null>(null);
  const [converting, setConverting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const folderRef = useRef<HTMLInputElement | null>(null);
  // Closing the theme sheet mid-folder unmounts this picker; the loop stops
  // at its next file rather than uploading on and selecting from a dead
  // instance over whatever the user picked meanwhile.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const adaptedItems: MediaItem[] = items.map(item => ({
    ...item,
    fps: item.type === 'animated' ? 30 : 1,
    frames: item.type === 'animated' ? Math.max(1, Math.round(item.durationSec * 30)) : 0,
  }));

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
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

  // One folder file, start to finish: the cropper's default (largest centred
  // crop at the panel aspect) stands in for the user's crop. The service
  // being unreachable ends the whole folder; a file it refuses is counted
  // and the rest continue.
  const importFolderFile = async (file: File): Promise<FolderFileOutcome> => {
    const staged = await stageBackgroundMedia(deviceId, file);
    if (!staged) return 'unreachable';
    if (staged.error) return 'failed';
    const size = await probeBackgroundMediaStageSize(deviceId, staged.stageId);
    if (!size) {
      cancelBackgroundMediaStage(deviceId, staged.stageId).catch(() => {});
      return 'failed';
    }
    const crop = serializeCrop(centerCropForAspect(deviceAspect, size.w, size.h));
    const result = await commitBackgroundMedia(deviceId, staged.stageId, crop, deviceW, deviceH);
    if (!result || result.error || !result.item) {
      cancelBackgroundMediaStage(deviceId, staged.stageId).catch(() => {});
      return result ? 'failed' : 'unreachable';
    }
    return result.item;
  };

  const handleFolderImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = folderImportCandidates(e.target.files);
    e.target.value = '';
    setImportError(null);
    if (files.length === 0) {
      setImportError(t('lighting.controls.importFolderEmpty'));
      return;
    }
    setImporting(true);
    let first: BackgroundMediaItem | null = null;
    let failed = 0;
    let error: string | null = null;
    for (let i = 0; i < files.length; i++) {
      setImportingName(files[i].name);
      setImportProgress({ n: i + 1, total: files.length });
      const outcome = await importFolderFile(files[i]);
      if (!aliveRef.current) return;
      if (outcome === 'unreachable') {
        error = t('lighting.controls.importNetworkError');
        break;
      }
      if (outcome === 'failed') {
        failed++;
        continue;
      }
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
    }
  };

  const handleCropConfirm = async (crop: NormalizedCrop, keepTransparency: boolean) => {
    if (!cropState) return;
    const { stageId } = cropState;
    const cropStr = serializeCrop(crop);
    setConverting(true);
    setImportError(null);
    const result = await commitBackgroundMedia(deviceId, stageId, cropStr, deviceW, deviceH, keepTransparency);
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
        <div className={styles.mediaHeader}>
          <Button
            type="button"
            icon={<Upload size={16} aria-hidden />}
            onClick={() => fileRef.current?.click()}
            disabled={importing}
          >
            {importing ? t('lighting.controls.importing') : t('lighting.controls.import')}
          </Button>
          <HoverTooltip body={t('lighting.controls.importFolderHint')} side="bottom">
            <Button
              type="button"
              icon={<FolderInput size={16} aria-hidden />}
              onClick={() => folderRef.current?.click()}
              disabled={importing}
            >
              {t('lighting.controls.importFolder')}
            </Button>
          </HoverTooltip>
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
            onChange={handleImport}
          />
          <input
            ref={folderRef}
            type="file"
            className={styles.hiddenInput}
            webkitdirectory=""
            multiple
            onChange={handleFolderImport}
          />
        </div>
        {importError && <p className={styles.mediaError}>{importError}</p>}
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
