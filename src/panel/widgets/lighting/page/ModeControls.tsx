import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { FolderOpen, Monitor, MonitorPlay, Sparkles, Upload, Zap } from 'lucide-react';
import {
  fetchScreenMonitors, startScreenMirror, fetchScreenEffect, setScreenEffect, reselectScreen,
  type ScreenMonitor, type PostProcessSettings,
} from '../../../../api/lighting';
import {
  cancelMediaStage,
  commitMedia,
  deleteMedia,
  mediaIdle,
  mediaStagePreviewUrl,
  openMediaFolder,
  stageMedia,
} from '../../../../api/mediaLibrary';
import { stageKlipy, type KlipyGif } from '../../../../api/klipy';
import { useTranslation } from '../../../../lib/i18n';
import type { LightingMode } from '../../../../types/lighting';
import { EffectCard } from '../../../../components/common/EffectCard/EffectCard';
import { ConfirmModal } from '../../../../components/common/ConfirmModal/ConfirmModal';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import { IconLabelButton } from '../../../../components/common/IconLabelButton/IconLabelButton';
import { Button } from '../../../../components/common/Button/Button';
import { MediaCropper, type NormalizedCrop } from '../../../../components/common/MediaCropper/MediaCropper';
import { serializeCrop } from '../../../../components/common/MediaCropper/mediaCrop';
import { useMediaLibrary } from '../effecteditor/useMediaLibrary';
import { MediaGrid } from '../effecteditor/MediaGrid';
import { KlipyPicker } from '../../../../components/common/KlipyPicker/KlipyPicker';
import styles from '../LightingPage.module.scss';

/**
 * Mode-specific control rows under the canvas for non-animate modes
 * (animate uses a full grid + the Effect-tab inspector). Media/Mirror
 * colour post-process lives in the Effect tab, so this handles only
 * the under-canvas rows: mirror monitor picker + filter presets,
 * media library, off message.
 */
export const ModeControls = memo(function ModeControls({ mode, screenPP, onScreenPPChange }: {
  mode: LightingMode;
  screenPP: PostProcessSettings;
  onScreenPPChange: (pp: PostProcessSettings) => void;
}) {
  switch (mode) {
    case 'animate': return null;
    case 'screen': return <ScreenControls screenPP={screenPP} onScreenPPChange={onScreenPPChange} />;
    case 'gif': return <MediaControls />;
    case 'none': return <OffControls />;
    case 'gamesync': return null;
  }
});

export function ScreenControls({ screenPP, onScreenPPChange }: {
  screenPP: PostProcessSettings;
  onScreenPPChange: (pp: PostProcessSettings) => void;
}) {
  const { t } = useTranslation();
  const [monitors, setMonitors] = useState<ScreenMonitor[]>([]);
  const [selectedMonitor, setSelectedMonitor] = useState('');
  const [selectionMode, setSelectionMode] = useState<'app' | 'system'>('app');

  useEffect(() => {
    fetchScreenMonitors().then(data => {
      if (data?.selectionMode) setSelectionMode(data.selectionMode);
      if (data?.monitors?.length) {
        setMonitors(data.monitors);
        setSelectedMonitor(data.monitors[0].id);
      }
    });
  }, []);

  const handleMonitorChange = async (id: string) => {
    setSelectedMonitor(id);
    const effect = await fetchScreenEffect();
    await startScreenMirror(
      effect?.saturation ?? 1,
      effect?.contrast ?? 1,
      id,
      effect?.hue ?? 0,
      effect?.colorize ?? 0,
    );
  };

  const applyReactive = async (reactive: boolean) => {
    const nextPP: PostProcessSettings = { ...screenPP, reactive };
    onScreenPPChange(nextPP);
    await setScreenEffect(nextPP, true);
    await startScreenMirror(nextPP.saturation, nextPP.contrast, selectedMonitor, nextPP.hue, nextPP.colorize);
  };

  return (
    <div className={styles.screenControls}>
      <div className={styles.monitorGrid}>
        <IconLabelButton
          className={styles.monitorButton}
          active={!screenPP.reactive}
          onPress={() => { void applyReactive(false); }}
          ariaLabel={t('lighting.filter.passthrough')}
          icon={<MonitorPlay aria-hidden="true" />}
          label={t('lighting.filter.passthrough')}
        />
        <IconLabelButton
          className={styles.monitorButton}
          active={!!screenPP.reactive}
          onPress={() => { void applyReactive(true); }}
          ariaLabel={t('lighting.filter.reactive')}
          icon={<Zap aria-hidden="true" />}
          label={t('lighting.filter.reactive')}
        />
      </div>
      <div className={styles.monitorPicker}>
        <span className={styles.compactLabel}>{t('lighting.controls.monitor')}</span>
        {selectionMode === 'system' ? (
          <button
            type="button"
            className={styles.filterChip}
            onClick={() => { reselectScreen().catch(() => {}); }}
          >
            {t('lighting.controls.changeScreen')}
          </button>
        ) : monitors.length === 0 ? (
          <span className={styles.compactLabel}>{t('lighting.controls.noMonitors')}</span>
        ) : (
          <div className={styles.monitorGrid}>
            {monitors.map(m => {
              const parsed = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(m.name);
              const title = parsed ? parsed[1] : m.name;
              const res = parsed ? parsed[2] : undefined;
              return (
                <IconLabelButton
                  key={m.id}
                  className={styles.monitorButton}
                  active={m.id === selectedMonitor}
                  onPress={() => { void handleMonitorChange(m.id); }}
                  ariaLabel={m.name}
                  icon={<Monitor aria-hidden="true" />}
                  label={(
                    <span className={styles.monitorButtonText}>
                      <span className={styles.monitorButtonTitle}>{title}</span>
                      {res && <span className={styles.monitorButtonRes}>{res}</span>}
                    </span>
                  )}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const LIGHTING_CROP_ASPECT = 160 / 90;

function MediaControls() {
  const { t } = useTranslation();
  const { items, activeId, thumbs, refresh, play, removeLocal } = useMediaLibrary();
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importingName, setImportingName] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [cropState, setCropState] = useState<{ stageId: string; src: string; name: string } | null>(null);
  const [converting, setConverting] = useState(false);
  const [klipyOpen, setKlipyOpen] = useState(false);
  const [klipyBusy, setKlipyBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImportError(null);
    setImporting(true);
    setImportingName(file.name);
    const result = await stageMedia(file);
    if (!result || result.error) {
      setImporting(false);
      setImportingName(null);
      setImportError(result?.msg || t('lighting.controls.importFailed'));
      return;
    }
    setImporting(false);
    setImportingName(null);
    setCropState({ stageId: result.stageId, src: mediaStagePreviewUrl(result.stageId), name: file.name });
  };

  const handleCropConfirm = useCallback(async (crop: NormalizedCrop) => {
    if (!cropState) return;
    const { stageId, name } = cropState;
    const cropStr = serializeCrop(crop);
    setConverting(true);
    setImportError(null);
    const result = await commitMedia(stageId, cropStr, name);
    setConverting(false);
    if (!result) {
      setImportError(t('lighting.controls.importNetworkError'));
      cancelMediaStage(stageId).catch(() => {});
      setCropState(null);
      return;
    }
    if (result.error || !result.item) {
      setImportError(result.msg || t('lighting.controls.importFailed'));
      cancelMediaStage(stageId).catch(() => {});
      setCropState(null);
      return;
    }
    await refresh();
    await play(result.item.id);
    setCropState(null);
  }, [cropState, t, refresh, play]);

  const handleCropCancel = useCallback(() => {
    if (cropState) {
      cancelMediaStage(cropState.stageId).catch(() => {});
    }
    setCropState(null);
    setImportError(null);
  }, [cropState]);

  // A pick is staged like an upload and lands in the same cropper.
  const handleKlipyPick = useCallback(async (gif: KlipyGif) => {
    setKlipyBusy(gif.slug);
    setImportError(null);
    const staged = await stageKlipy(gif.slug);
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
    setCropState({ stageId: staged.stageId, src: mediaStagePreviewUrl(staged.stageId), name: `${gif.slug}.gif` });
  }, [t]);

  const handleOpenFolder = async () => {
    await openMediaFolder();
  };

  const handleDelete = async (id: string) => {
    const isActive = id === activeId;
    const nextItem = isActive
      ? items.filter(item => item.id !== id)[0] ?? null
      : null;
    const deleted = await deleteMedia(id);
    if (!deleted) {
      await refresh();
      return;
    }
    removeLocal(id);
    await refresh();
    if (isActive) {
      if (nextItem) {
        await play(nextItem.id);
      } else {
        await mediaIdle();
      }
    }
  };

  const requestDelete = (id: string, name: string) => {
    setPendingDelete({ id, name });
  };
  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    await handleDelete(id);
  };

  return (
    <>
      {cropState && (
        <MediaCropper
          src={cropState.src}
          aspect={LIGHTING_CROP_ASPECT}
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
            onClick={handleOpenFolder}
          >
            {t('lighting.controls.mediaManageFolder')}
          </Button>
        </HoverTooltip>
        <Button
          type="button"
          icon={<Sparkles size={16} aria-hidden />}
          onClick={() => setKlipyOpen(true)}
        >
          {t('lighting.controls.klipyBrowse')}
        </Button>
        <input ref={fileRef} type="file" className={styles.hiddenInput}
          accept="image/*,video/*,.gif" onChange={handleImport} />
      </div>
      <KlipyPicker
        open={klipyOpen}
        busySlug={klipyBusy}
        importError={klipyOpen ? importError : null}
        onPick={handleKlipyPick}
        onClose={() => { setKlipyOpen(false); setImportError(null); }}
      />
      {importError && (
        <p className={styles.mediaError}>{importError}</p>
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
        items={items}
        activeId={activeId}
        thumbs={thumbs}
        onPlay={play}
        onDelete={requestDelete}
        deleteAriaLabel={t('lighting.controls.mediaDelete')}
        prepend={importingName ? (
          <EffectCard
            asDiv
            label={importingName.replace(/\.[^.]+$/, '')}
            thumbUrl={null}
            active={false}
            onClick={() => {}}
            meta={t('lighting.controls.importing')}
            thumbOverlay={<span className={styles.mediaSpinner} role="status" aria-label={t('lighting.controls.importing')} />}
            ariaLabel={importingName}
          />
        ) : undefined}
      />
    </div>
    </>
  );
}

function OffControls() {
  const { t } = useTranslation();
  return <p className={styles.offMessage}>{t('lighting.off.message')}</p>;
}
