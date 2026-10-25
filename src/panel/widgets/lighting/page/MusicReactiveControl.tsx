import { Music } from 'lucide-react';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import type { LightingAudioOutput } from '../../../../hooks/useLightingAudioOutput';
import { useTranslation } from '../../../../lib/i18n';
import { AudioSourceSelect } from './AudioSourceSelect';
import styles from './MusicReactiveControl.module.scss';

interface MusicReactiveControlProps {
  active: boolean;
  onToggle: () => void;
  /** Absent hides the source picker (macOS capture takes the whole system mix). */
  output?: LightingAudioOutput;
}

/** The music-note button and capture source picker pinned to the top left of an effect preview. */
export function MusicReactiveControl({ active, onToggle, output }: MusicReactiveControlProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.root}>
      <HoverTooltip body={t('lighting.musicReactive')} side="left">
        <button
          type="button"
          className={`${styles.btn} ${active ? styles.btnOn : ''}`}
          onClick={onToggle}
          aria-pressed={active}
          aria-label={t('lighting.musicReactive')}
        >
          <Music size={14} strokeWidth={1.5} />
        </button>
      </HoverTooltip>
      {output && <AudioSourceSelect output={output} className={styles.source} />}
    </div>
  );
}
