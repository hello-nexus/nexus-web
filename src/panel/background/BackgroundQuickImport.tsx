import { forwardRef, useEffect, useImperativeHandle } from 'react';
import { useToastSafe } from '../../components/common/Toast/Toast';
import { MediaCropper } from '../../components/common/MediaCropper/MediaCropper';
import { KlipyPicker } from '../../components/common/KlipyPicker/KlipyPicker';
import { useBackgroundMediaImport } from './useBackgroundMediaImport';
import type { PanelSlideshowSettings } from '../editor/PanelThemeSettings';
import styles from '../widgets/lighting/LightingPage.module.scss';

export interface BackgroundQuickImportHandle {
  openFiles: () => void;
  openGifs: () => void;
}

interface BackgroundQuickImportProps {
  deviceId: string;
  deviceAspect: number;
  round?: boolean;
  deviceW: number;
  deviceH: number;
  onSelect: (mediaId: string | null, type: 'static' | 'animated' | null, alpha: boolean) => void;
  slideshow?: PanelSlideshowSettings;
  onSlideshowChange?: (patch: Partial<PanelSlideshowSettings>) => void;
}

const noRefresh = () => Promise.resolve();

/**
 * The picker's import and GIF flows without its media grid: the file dialog,
 * Klipy browser, cropper and commit, started from outside (the preview's
 * background menu).
 */
export const BackgroundQuickImport = forwardRef<BackgroundQuickImportHandle, BackgroundQuickImportProps>(
  function BackgroundQuickImport({ deviceId, deviceAspect, round = false, deviceW, deviceH, onSelect, slideshow, onSlideshowChange }, ref) {
    const flow = useBackgroundMediaImport({
      deviceId, deviceW, deviceH, refresh: noRefresh, onSelect,
      // Several files are imported to be cycled, as in the Background tab.
      onImported: imported => {
        if (imported >= 2 && slideshow && !slideshow.enabled) onSlideshowChange?.({ enabled: true });
      },
    });
    const { fileRef, setKlipyOpen, importError, klipyOpen } = flow;
    const { push } = useToastSafe();
    // The picker prints a failure under its grid; with no grid here it is a toast.
    useEffect(() => {
      if (importError && !klipyOpen) push({ title: importError });
    }, [importError, klipyOpen, push]);
    useImperativeHandle(ref, () => ({
      openFiles: () => fileRef.current?.click(),
      openGifs: () => setKlipyOpen(true),
    }), [fileRef, setKlipyOpen]);
    return (
      <>
        {flow.cropState && (
          <MediaCropper
            src={flow.cropState.src}
            kind={flow.cropState.kind}
            fallbackSrc={flow.cropState.fallbackSrc}
            aspect={deviceAspect}
            round={round}
            busy={flow.converting}
            allowTransparency={flow.cropState.alpha}
            allowFit
            onConfirm={flow.handleCropConfirm}
            onCancel={flow.handleCropCancel}
          />
        )}
        <input
          ref={fileRef}
          type="file"
          className={styles.hiddenInput}
          accept="image/*,video/*,.gif"
          multiple
          onChange={flow.handleImport}
        />
        <KlipyPicker
          open={flow.klipyOpen}
          busySlug={flow.klipyBusy}
          importError={flow.klipyOpen ? flow.importError : null}
          thumbAspect={deviceAspect}
          onPick={flow.handleKlipyPick}
          onClose={() => { flow.setKlipyOpen(false); flow.setImportError(null); }}
        />
      </>
    );
  },
);
