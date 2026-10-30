import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../lib/i18n';
import type { NormalizedCrop } from '../../components/common/MediaCropper/MediaCropper';
import { serializeCrop } from '../../components/common/MediaCropper/mediaCrop';
import {
  type BackgroundMediaItem,
  backgroundMediaStagePreviewUrl,
  backgroundMediaStageRawUrl,
  cancelBackgroundMediaStage,
  commitBackgroundMedia,
  stageBackgroundMedia,
  isBackgroundMediaTooLarge,
  isStageTooLargeRefusal,
  BACKGROUND_MEDIA_MAX_MB,
} from '../../api/panelBackgroundMedia';
import { stageKlipyBackground, type KlipyGif } from '../../api/klipy';
import { stagePreviewFor } from '../../api/mediaLibrary';

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

/**
 * The upload, Klipy, crop and commit flow behind every background media import.
 * `onSelect` receives the first imported item once the queue is done; `onImported`
 * the number of items that landed.
 */
export function useBackgroundMediaImport({
  deviceId,
  deviceW,
  deviceH,
  refresh,
  onSelect,
  onImported,
}: {
  deviceId: string;
  deviceW: number;
  deviceH: number;
  refresh: () => Promise<unknown>;
  onSelect: (mediaId: string | null, type: 'static' | 'animated' | null, alpha: boolean) => void;
  onImported?: (imported: number) => void;
}) {
  const { t } = useTranslation();
  const [importing, setImporting] = useState(false);
  const [importingName, setImportingName] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<{ n: number; total: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
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

  // Every import goes through the cropper, one file at a time: a selection is
  // a queue, and each confirm or cancel stages the next. The tally decides
  // what to select and whether to start a slideshow once the queue is empty.
  const queueRef = useRef<File[]>([]);
  const batchRef = useRef({ total: 0, imported: 0, failed: 0, tooLarge: 0, first: null as BackgroundMediaItem | null });

  const finishBatch = async () => {
    const { total, imported, failed, tooLarge, first } = batchRef.current;
    setImporting(false);
    setImportingName(null);
    setImportProgress(null);
    setImportError(
      failed === 0 ? null
        : tooLarge === failed ? t('lighting.controls.importTooLarge', { limit: BACKGROUND_MEDIA_MAX_MB })
        : t('lighting.controls.importFolderPartial', { failed, total }),
    );
    if (!first) return;
    await refresh();
    if (!aliveRef.current) return;
    onSelect(first.id, first.type, !!first.alpha);
    onImported?.(imported);
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
    if (isBackgroundMediaTooLarge(file)) {
      batchRef.current.failed += 1;
      batchRef.current.tooLarge += 1;
      await stageNext();
      return;
    }
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
      if (isStageTooLargeRefusal(staged)) batchRef.current.tooLarge += 1;
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
    const pickedCount = picked?.length ?? 0;
    e.target.value = '';
    if (files.length === 0) {
      setImportError(pickedCount > 0 ? t('lighting.controls.importFolderEmpty') : null);
      return;
    }
    setImportError(null);
    queueRef.current = files;
    batchRef.current = { total: files.length, imported: 0, failed: 0, tooLarge: 0, first: null };
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
    batchRef.current = { total: 1, imported: 0, failed: 0, tooLarge: 0, first: null };
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

  return {
    importing,
    importingName,
    importProgress,
    importError,
    setImportError,
    cropState,
    converting,
    klipyOpen,
    setKlipyOpen,
    klipyBusy,
    fileRef,
    handleImport,
    handleKlipyPick,
    handleCropConfirm,
    handleCropCancel,
  };
}
