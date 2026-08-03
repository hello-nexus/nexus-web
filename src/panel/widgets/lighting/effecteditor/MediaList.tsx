import { Image as ImageIcon } from 'lucide-react';
import { EmptyState } from '../../../../components/common/EmptyState/EmptyState';
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
        <EmptyState
          className={styles.mediaEmpty}
          icon={<ImageIcon size={22} />}
          title={t('lighting.controls.noMediaTitle')}
          hint={t('lighting.controls.noMedia')}
        />
      )}
      <MediaGrid items={items} activeId={activeId} thumbs={thumbs} onPlay={play} />
    </div>
  );
}
