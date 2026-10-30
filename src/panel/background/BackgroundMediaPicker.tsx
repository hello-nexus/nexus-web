import { useState } from 'react';
import { FolderOpen, Image as ImageIcon, Sparkles, Upload } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { useToastSafe } from '../../components/common/Toast/Toast';
import { HoverTooltip } from '../../components/common/HoverTooltip/HoverTooltip';
import { Button } from '../../components/common/Button/Button';
import { SettingSelect, SettingToggle } from '../../components/common/SettingRow/SettingRow';
import { EffectCard } from '../../components/common/EffectCard/EffectCard';
import { EmptyState } from '../../components/common/EmptyState/EmptyState';
import { ConfirmModal } from '../../components/common/ConfirmModal/ConfirmModal';
import { MediaGrid } from '../widgets/lighting/effecteditor/MediaGrid';
import { MediaCropper } from '../../components/common/MediaCropper/MediaCropper';
import { KlipyPicker } from '../../components/common/KlipyPicker/KlipyPicker';
import { useBackgroundMedia } from './useBackgroundMedia';
import { useBackgroundMediaImport } from './useBackgroundMediaImport';
import { deleteBackgroundMedia, openBackgroundMediaFolder } from '../../api/panelBackgroundMedia';
import type { MediaItem } from '../../api/mediaLibrary';
import { SLIDESHOW_INTERVALS, slideshowIntervalLabel } from '../slideshow/slideshow';
import { orderBackgroundMedia } from './slideshowOrder';
import type { PanelSlideshowSettings } from '../editor/PanelThemeSettings';
import styles from '../widgets/lighting/LightingPage.module.scss';

export function BackgroundMediaPicker({
  deviceId,
  activeId,
  deviceAspect,
  round = false,
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
  /** Round display: the tiles are circles. */
  round?: boolean;
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
  const { push } = useToastSafe();
  const { items, thumbs, refresh, removeLocal } = useBackgroundMedia(deviceId);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const {
    importing, importingName, importProgress, importError, setImportError, cropState, converting,
    klipyOpen, setKlipyOpen, klipyBusy, fileRef,
    handleImport, handleKlipyPick, handleCropConfirm, handleCropCancel,
  } = useBackgroundMediaImport({
    deviceId,
    deviceW,
    deviceH,
    refresh,
    onSelect,
    slideshow,
    onSlideshowChange,
  });

  const adaptedItems: MediaItem[] = orderBackgroundMedia(items, order).map(item => ({
    ...item,
    fps: item.type === 'animated' ? 30 : 1,
    frames: item.type === 'animated' ? Math.max(1, Math.round(item.durationSec * 30)) : 0,
  }));

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
          round={round}
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
              onClick={() => {
                openBackgroundMediaFolder(deviceId)
                  .then(ok => { if (!ok) push({ title: t('common.openFolderFailed') }); })
                  .catch(() => push({ title: t('common.openFolderFailed') }));
              }}
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
          thumbAspect={deviceAspect}
          thumbRound={round}
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
              thumbAspect={deviceAspect}
              thumbRound={round}
            />
          ) : undefined}
        />
      </div>
    </>
  );
}
