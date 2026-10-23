import { Music } from 'lucide-react';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import { useTranslation } from '../../../../lib/i18n';
import { AudioSourceSelect } from './AudioSourceSelect';
import styles from './MusicReactiveControl.module.scss';

interface MusicReactiveControlProps {
  active: boolean;
  /** Absent: the icon only reports the state and does not toggle. */
  onToggle?: () => void;
  /** Windows only: the macOS capture takes the whole system mix, so there is no source to name. */
  showSource: boolean;
}

/** The music-note button and capture source picker pinned to the top left of an effect preview. */
export function MusicReactiveControl({ active, onToggle, showSource }: MusicReactiveControlProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.root}>
      <HoverTooltip body={t('lighting.musicReactive')} side="left">
        <button
          type="button"
          className={`${styles.btn} ${active ? styles.btnOn : ''}`}
          onClick={onToggle}
          disabled={!onToggle}
          aria-label={t('lighting.musicReactive')}
          aria-pressed={onToggle ? active : undefined}
        >
          <Music size={14} strokeWidth={1.5} />
        </button>
      </HoverTooltip>
      {showSource && <AudioSourceSelect className={styles.source} />}
    </div>
  );
}
