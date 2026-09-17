import { useTranslation } from '../../lib/i18n';
import { Spinner } from '../../components/common/Spinner/Spinner';
import { Card } from '../../components/common/Card/Card';
import { Button } from '../../components/common/Button/Button';
import styles from './AuthResultCard.module.scss';

/** Centered spinner + label shown while a verify/recover token is being posted. */
export function AuthLoadingCard({ label }: { label: string }) {
  return (
    <div className={styles.loading}>
      <Spinner size={32} />
      <p className={styles.loadingLabel}>{label}</p>
    </div>
  );
}

/** Terminal state card for /auth/verify and /auth/recover: title + body, an optional retry action, and an optional link back to hellonexus.com. */
export function AuthResultCard({ title, body, showBackLink, action }: {
  title: string;
  body: string;
  showBackLink?: boolean;
  action?: { label: string; onClick: () => void };
}) {
  const { t } = useTranslation();
  return (
    <Card title={title} className={styles.card}>
      <p className={styles.body}>{body}</p>
      {action && (
        <Button tone="accent" onClick={action.onClick} className={styles.backLink}>{action.label}</Button>
      )}
      {showBackLink && (
        <Button href="/" className={styles.backLink}>{t('common.backToNexus')}</Button>
      )}
    </Card>
  );
}
