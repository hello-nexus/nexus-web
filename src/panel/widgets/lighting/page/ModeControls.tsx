import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Monitor, MonitorPlay, Zap } from 'lucide-react';
import {
  fetchScreenMonitors, startScreenMirror, fetchScreenEffect, setScreenEffect, reselectScreen,
  type ScreenMonitor, type PostProcessSettings,
} from '../../../../api/lighting';
import {
  deleteMedia,
  importMedia,
  openMediaFolder,
} from '../../../../api/mediaLibrary';
import { useTranslation } from '../../../../lib/i18n';
import type { LightingMode } from '../../../../types/lighting';
import { EffectCard } from '../../../../components/common/EffectCard/EffectCard';
import { ConfirmModal } from '../../../../components/common/ConfirmModal/ConfirmModal';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import { IconLabelButton } from '../../../../components/common/IconLabelButton/IconLabelButton';
import { MediaCropper, type NormalizedCrop } from '../../../../components/common/MediaCropper/MediaCropper';
import { useMediaLibrary } from '../effecteditor/useMediaLibrary';
import { MediaGrid } from '../effecteditor/MediaGrid';
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

// 16:9 = 160/90 as specified for the lighting cropper aspect.
const LIGHTING_CROP_ASPECT = 160 / 90;

// Capture first video frame to a canvas dataURL for use as cropper still.
function captureVideoFrame(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    video.src = url;
    video.muted = true;
    video.currentTime = 0;
    const cleanup = () => URL.revokeObjectURL(url);
    video.onloadeddata = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 180;
        const ctx = canvas.getContext('2d');
        if (!ctx) { cleanup(); reject(new Error('no ctx')); return; }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        cleanup();
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      } catch (err) {
        cleanup();
        reject(err);
      }
    };
    video.onerror = () => { cleanup(); reject(new Error('video error')); };
  });
}

function MediaControls() {
  const { t } = useTranslation();
  const { items, activeId, thumbs, refresh, play, removeLocal } = useMediaLibrary();
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importingName, setImportingName] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  // cropState holds the file + still src while the cropper is open.
  const [cropState, setCropState] = useState<{ file: File; stillSrc: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const runImport = useCallback(async (file: File, crop: NormalizedCrop) => {
    const cropStr = `${crop.x.toFixed(6)},${crop.y.toFixed(6)},${crop.w.toFixed(6)},${crop.h.toFixed(6)}`;
    setImporting(true);
    setImportingName(file.name);
    setImportError(null);
    const result = await importMedia(file, cropStr);
    setImporting(false);
    setImportingName(null);
    if (!result) {
      setImportError(t('lighting.controls.importNetworkError'));
    } else if (result.error || !result.item) {
      setImportError(result.msg || t('lighting.controls.importFailed'));
    } else {
      await refresh();
      await play(result.item.id);
    }
  }, [t, refresh, play]);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    // Determine the still src for the cropper.
    const isVideo = file.type.startsWith('video/') || file.name.toLowerCase().endsWith('.gif');
    let stillSrc: string;
    if (isVideo) {
      try {
        stillSrc = await captureVideoFrame(file);
      } catch {
        // If frame capture fails, skip the cropper and import with no crop.
        setImporting(true);
        setImportingName(file.name);
        setImportError(null);
        const result = await importMedia(file);
        setImporting(false);
        setImportingName(null);
        if (!result) setImportError(t('lighting.controls.importNetworkError'));
        else if (result.error || !result.item) setImportError(result.msg || t('lighting.controls.importFailed'));
        else { await refresh(); await play(result.item.id); }
        return;
      }
    } else {
      stillSrc = URL.createObjectURL(file);
    }
    setCropState({ file, stillSrc });
  };

  const handleOpenFolder = async () => {
    await openMediaFolder();
  };

  const handleDelete = async (id: string) => {
    const deleted = await deleteMedia(id);
    if (!deleted) {
      await refresh();
      return;
    }
    removeLocal(id);
    await refresh();
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

  const handleCropConfirm = useCallback(async (crop: NormalizedCrop) => {
    if (!cropState) return;
    const { file, stillSrc } = cropState;
    // Revoke object URL if it was created for an image file.
    if (stillSrc.startsWith('blob:')) URL.revokeObjectURL(stillSrc);
    setCropState(null);
    await runImport(file, crop);
  }, [cropState, runImport]);

  const handleCropCancel = useCallback(() => {
    if (cropState?.stillSrc.startsWith('blob:')) URL.revokeObjectURL(cropState.stillSrc);
    setCropState(null);
  }, [cropState]);

  return (
    <>
      {cropState && (
        <MediaCropper
          src={cropState.stillSrc}
          aspect={LIGHTING_CROP_ASPECT}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
    <div className={styles.mediaSection}>
      <div className={styles.mediaHeader}>
        <button type="button" className={styles.importBtn} onClick={() => fileRef.current?.click()} disabled={importing}>
          {importing ? t('lighting.controls.importing') : t('lighting.controls.import')}
        </button>
        <HoverTooltip body={t('lighting.controls.mediaManageFolder')} side="bottom">
          <button type="button" className={styles.manageFolderBtn} onClick={handleOpenFolder}
            aria-label={t('lighting.controls.mediaManageFolder')}>
            <svg className={styles.manageFolderIcon} width="14" height="14" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v2" />
              <path d="m3 10 2.5 9.2A2 2 0 0 0 7.4 21h10.2a2 2 0 0 0 1.93-1.47L22 11H6.4a2 2 0 0 0-1.93 1.47Z" />
            </svg>
            <span>{t('lighting.controls.mediaManageFolder')}</span>
          </button>
        </HoverTooltip>
        <input ref={fileRef} type="file" className={styles.hiddenInput}
          accept="image/*,video/*,.gif" onChange={handleImport} />
      </div>
      {importError && (
        <p className={styles.mediaError}>{importError}</p>
      )}
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
            onClick={() => { /* no-op while importing */ }}
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
