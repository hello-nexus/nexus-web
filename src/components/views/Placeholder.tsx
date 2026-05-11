import { useTranslation } from '../../lib/i18n';
import styles from './Placeholder.module.scss';

interface PlaceholderProps {
  title: string;
}

export function Placeholder({ title }: PlaceholderProps) {
  const { t } = useTranslation();

  return (
    <section className={styles.placeholder}>
      <div className={styles.badge}>{t('placeholder.badge')}</div>
      <h2>{title}</h2>
    </section>
  );
}
