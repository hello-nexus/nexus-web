import { useState } from 'react';
import { Button } from '../../../common/Button/Button';
import { useTranslation } from '../../../../lib/i18n';
import type { AuthBackend } from '../../../../api/authBackend';
import { authErrorMessage } from './accountErrors';
import { useResendCooldown } from './resendCooldown';
import styles from './Account.module.scss';

interface ResendVerificationProps {
  backend: AuthBackend;
  email: string;
  /** Seconds to wait before the first press: a full cooldown right after a mail went out, 0 when none did. */
  initialCooldown: number;
}

export function ResendVerification({ backend, email, initialCooldown }: ResendVerificationProps) {
  const { t } = useTranslation();
  const { remaining, start } = useResendCooldown(initialCooldown);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleResend = async () => {
    setSending(true);
    setSent(false);
    setError(null);
    const result = await backend.resendVerification(email);
    setSending(false);
    start();
    if (result === 'ok') setSent(true);
    else setError(result === 'rate_limited' ? t('account.verify.resendRateLimited') : authErrorMessage(t, null));
  };

  return (
    <div className={styles.resendRow}>
      <Button
        type="button"
        size="sm"
        loading={sending}
        disabled={remaining > 0 || sending}
        onClick={() => void handleResend()}
      >
        {remaining > 0 ? t('account.verify.resendWait', { seconds: remaining }) : t('account.verify.resend')}
      </Button>
      <div className={styles.resendLine}>
        <p className={styles.error} role="alert">{error ?? ''}</p>
        <p className={styles.resendStatus} role="status">{!error && sent ? t('account.verify.resendSent') : ''}</p>
      </div>
    </div>
  );
}
