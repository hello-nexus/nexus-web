import { ChevronRight, Headphones } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import styles from './MixerWidget.module.scss';

/** Full-width band above the faders: what everything below is measured against. */
export function MixerOutputSection({ name, onClick }: { name: string; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className={styles.outputSection}
      aria-label={t('panel.widget.mixer.aria.pickOutput')}
      onClick={onClick}
    >
      <span className={styles.outputCircle}>
        <Headphones className={styles.outputGlyph} strokeWidth={1.7} />
      </span>
      <span className={styles.outputText}>
        <span className={styles.outputKind}>{t('panel.widget.mixer.output')}</span>
        <span className={styles.outputName}>{name || t('panel.widget.mixer.noOutput')}</span>
      </span>
      <ChevronRight className={styles.outputChevron} strokeWidth={2} />
    </button>
  );
}
