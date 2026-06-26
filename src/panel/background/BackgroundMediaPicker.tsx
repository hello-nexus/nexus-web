import { useRef, useState } from 'react';
import { useTranslation } from '../../lib/i18n';
import { HoverTooltip } from '../../components/common/HoverTooltip/HoverTooltip';
import { EffectCard } from '../../components/common/EffectCard/EffectCard';
import { ConfirmModal } from '../../components/common/ConfirmModal/ConfirmModal';
import { MediaGrid } from '../widgets/lighting/effecteditor/MediaGrid';
import { MediaCropper, type NormalizedCrop } from '../../components/common/MediaCropper/MediaCropper';
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
      setImportError(t('lighting.controls.importFailed'));
      return;
    }
    setImporting(false);
    setImportingName(null);
    setCropState({ stageId: result.stageId, src: backgroundMediaStagePreviewUrl(deviceId, result.stageId) });
  };

  const handleCropConfirm = async (crop: NormalizedCrop) => {
    if (!cropState) return;
    const { stageId } = cropState;
    const cropStr = `${crop.x.toFixed(6)},${crop.y.toFixed(6)},${crop.w.toFixed(6)},${crop.h.toFixed(6)}`;
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
          <button
            type="button"
            className={styles.importBtn}
            onClick={() => fileRef.current?.click()}
            disabled={importing}
          >
            {importing ? t('lighting.controls.importing') : t('lighting.controls.import')}
          </button>
          <HoverTooltip body={t('lighting.controls.mediaManageFolder')} side="bottom">
            <button
              type="button"
              className={styles.manageFolderBtn}
              onClick={() => { openBackgroundMediaFolder(deviceId).catch(() => {}); }}
              aria-label={t('lighting.controls.mediaManageFolder')}
            >
              <svg className={styles.manageFolderIcon} width="14" height="14" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true">
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v2" />
                <path d="m3 10 2.5 9.2A2 2 0 0 0 7.4 21h10.2a2 2 0 0 0 1.93-1.47L22 11H6.4a2 2 0 0 0-1.93 1.47Z" />
              </svg>
              <span>{t('lighting.controls.mediaManageFolder')}</span>
            </button>
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
          <p className={styles.mediaEmpty}>{t('lighting.controls.noMedia')}</p>
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
