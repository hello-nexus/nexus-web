import { useCallback, useEffect, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { EmptyState } from '../../../../components/common/EmptyState/EmptyState';
import { fetchMediaLibrary } from '../../../../api/mediaLibrary';
import { useTopicCallback } from '../../../../hooks/useMultiplexSocket';
import { useTranslation } from '../../../../lib/i18n';
import { usePanelPreview } from '../../common/PanelPreviewContext';
import styles from '../LightingPage.module.scss';

/**
 * "No media" notice drawn over the lighting preview in media mode. Pure
 * frontend chrome - it sits on the canvas element, never in the frame data the
 * LEDs render, so nothing about it reaches the devices.
 *
 * Tracks only the library's emptiness, so unlike useMediaLibrary it subscribes
 * to mediaLibrary alone and never refetches on a lighting broadcast.
 */
export function MediaCanvasNotice() {
  const { t } = useTranslation();
  const preview = usePanelPreview();
  const [empty, setEmpty] = useState<boolean | null>(null);

  // Only a readable response decides emptiness: fetchService yields null for a
  // transport error and for a remote origin whose relay tunnel is not up yet,
  // and treating that as empty would paint the notice over a playing canvas.
  const refresh = useCallback(async () => {
    const lib = await fetchMediaLibrary();
    if (lib?.items) setEmpty(lib.items.length === 0);
  }, []);

  useEffect(() => { if (!preview) refresh(); }, [preview, refresh]);
  useTopicCallback('mediaLibrary', !preview, refresh);

  // Stays out of the DOM until the library is known empty, so a populated
  // library never flashes the notice over the first frames.
  if (empty !== true) return null;

  return (
    <EmptyState
      className={styles.canvasNotice}
      icon={<ImageIcon size={22} />}
      title={t('lighting.controls.noMediaTitle')}
      hint={t('lighting.controls.noMedia')}
    />
  );
}
