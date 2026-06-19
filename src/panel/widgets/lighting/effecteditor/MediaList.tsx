import { useTranslation } from '../../../../lib/i18n';
import { useMediaLibrary } from './useMediaLibrary';
import { MediaGrid } from './MediaGrid';
import styles from '../LightingPage.module.scss';

/**
 * Read-only media picker for the immersive editor's Options tab - pick a clip
 * to play. No import / delete / folder chrome; that lives only on the desktop
 * MediaControls.
 */
export function MediaList() {
  const { t } = useTranslation();
  const { items, activeId, thumbs, play } = useMediaLibrary();
  return (
    <div className={styles.mediaSection}>
      {items.length === 0 && (
        <p className={styles.mediaEmpty}>{t('lighting.controls.noMedia')}</p>
      )}
      <MediaGrid items={items} activeId={activeId} thumbs={thumbs} onPlay={play} />
    </div>
  );
}
