import { useRef, useState } from 'react';
import { FolderOpen, Image as ImageIcon, Upload } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { HoverTooltip } from '../../components/common/HoverTooltip/HoverTooltip';
import { Button } from '../../components/common/Button/Button';
import { EffectCard } from '../../components/common/EffectCard/EffectCard';
import { EmptyState } from '../../components/common/EmptyState/EmptyState';
import { ConfirmModal } from '../../components/common/ConfirmModal/ConfirmModal';
import { MediaGrid } from '../widgets/lighting/effecteditor/MediaGrid';
import { MediaCropper, type NormalizedCrop } from '../../components/common/MediaCropper/MediaCropper';
import { serializeCrop } from '../../components/common/MediaCropper/mediaCrop';
import { useBackgroundMedia } from './useBackgroundMedia';
import {
  backgroundMediaStagePreviewUrl,
  cancelBackgroundMediaStage,
  commitBackgroundMedia,
  deleteBackgroundMedia,
  openBackgroundMediaFolder,
  stageBackgroundMedia,
} from '../../api/panelBackgroundMedia';
import type { MediaItem } from '../../api/mediaLibrary';
import styles from '../widgets/lighting/LightingPage.module.scss';

const BG_THUMB_ASPECT = 720 / 1280;

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
  onSelect: (mediaId: string | null, type: 'static' | 'animated' | null) => void;
}) {
  const { t } = useTranslation();
  const { items, thumbs, refresh, removeLocal } = useBackgroundMedia(deviceId);
  const [importing, setImporting] = useState(false);
  const [importingName, setImportingName] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [cropState, setCropState] = useState<{ stageId: string; src: string } | null>(null);
  const [converting, setConverting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

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
    setCropState({ stageId: result.stageId, src: backgroundMediaStagePreviewUrl(deviceId, result.stageId) });
  };

  const handleCropConfirm = async (crop: NormalizedCrop) => {
    if (!cropState) return;
    const { stageId } = cropState;
    const cropStr = serializeCrop(crop);
    setConverting(true);
    setImportError(null);
    const result = await commitBackgroundMedia(deviceId, stageId, cropStr, deviceW, deviceH);
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
    onSelect(result.item.id, result.item.type);
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
    onSelect(id, selectedItem.type);
  };

  const handleDelete = async (id: string) => {
    const isActive = id === activeId;
    const nextItem = isActive ? items.filter(item => item.id !== id)[0] ?? null : null;
    const ok = await deleteBackgroundMedia(deviceId, id);
    if (!ok) { await refresh(); return; }
    removeLocal(id);
    await refresh();
    if (isActive) {
      if (nextItem) onSelect(nextItem.id, nextItem.type);
      else onSelect(null, null);
    }
  };

  const requestDelete = (id: string, name: string) => setPendingDelete({ id, name });
  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    setPendingDelete(null);
    await handleDelete(id);
  };

  return (
    <>
      {cropState && (
        <MediaCropper
          src={cropState.src}
          aspect={deviceAspect}
          busy={converting}
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
              meta={t('lighting.controls.importing')}
              thumbOverlay={<span className={styles.mediaSpinner} role="status" aria-label={t('lighting.controls.importing')} />}
              ariaLabel={importingName}
              thumbAspect={BG_THUMB_ASPECT}
            />
          ) : undefined}
        />
      </div>
    </>
  );
}
