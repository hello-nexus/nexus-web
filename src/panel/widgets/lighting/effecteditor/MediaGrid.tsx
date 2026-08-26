import type { ReactNode } from 'react';
import { useTranslation } from '../../../../lib/i18n';
import { useUnitPrefs } from '../../../../hooks/useUiSettings';
import { localizeNumbers } from '../../../../lib/units';
import { EffectCard } from '../../../../components/common/EffectCard/EffectCard';
import type { MediaItem } from '../../../../api/mediaLibrary';
import styles from '../LightingPage.module.scss';

/**
 * Pure presenter for the media library grid. `onDelete` is optional - the
 * desktop MediaControls passes it (with a confirm flow); the immersive
 * read-only picker omits it. `prepend` lets the desktop slot an "importing…"
 * placeholder card at the front.
 */
export function MediaGrid({ items, activeId, thumbs, onPlay, onDelete, deleteAriaLabel, prepend, thumbAspect }: {
  items: MediaItem[];
  activeId: string | null;
  thumbs: Record<string, string>;
  onPlay: (id: string) => void;
  onDelete?: (id: string, label: string) => void;
  deleteAriaLabel?: string;
  prepend?: ReactNode;
  thumbAspect?: number;
}) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  return (
    <div className={styles.mediaGrid}>
      {prepend}
      {items.map(item => {
        const label = item.name.replace(/\.[^.]+$/, '');
        const meta = item.type === 'animated'
          ? `${localizeNumbers((item.frames / Math.max(item.fps, 1)).toFixed(1), numberFormat)}s`
          : t('lighting.controls.mediaStatic');
        return (
          <EffectCard
            key={item.id}
            asDiv
            label={label}
            thumbUrl={thumbs[item.id] ?? null}
            active={item.id === activeId}
            onClick={() => onPlay(item.id)}
            meta={meta}
            onDelete={onDelete ? () => onDelete(item.id, label) : undefined}
            deleteAriaLabel={deleteAriaLabel}
            ariaLabel={label}
            thumbAspect={thumbAspect}
          />
        );
      })}
    </div>
  );
}
