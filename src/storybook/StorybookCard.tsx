import type { StorybookEntry } from './registry';
import { useTranslation } from '../lib/i18n';
import styles from './StorybookModal.module.scss';

/*
 * One catalog card. Header (name), description, file path, preview area.
 * Preview is optional for components that require live service state.
 */
export function StorybookCard({ entry }: { entry: StorybookEntry }) {
  const { t } = useTranslation();
  const Preview = entry.Preview;

  return (
    <div className={styles.card} data-full-width={entry.fullWidth || undefined}>
      <div className={styles.cardHead}>
        <h4 className={styles.cardName}>{entry.name}</h4>
        {entry.usageCount !== undefined && (
          <span className={styles.cardUsage}>{t('storybook.usage', { n: entry.usageCount })}</span>
        )}
      </div>
      <p className={styles.cardDesc}>{entry.description}</p>
      <code className={styles.cardPath}>{entry.filePath}</code>
      {entry.notes && <p className={styles.cardNotes}>{entry.notes}</p>}
      <div className={styles.cardPreview}>
        {Preview ? <Preview /> : <span className={styles.cardPreviewEmpty}>-</span>}
      </div>
    </div>
  );
}
