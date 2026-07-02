import { useState } from 'react';
import { Button } from '../../../common/Button/Button';
import { useTranslation } from '../../../../lib/i18n';
import type { AuthBackend } from '../../../../api/authBackend';
import { CreateAccountForm } from './CreateAccountForm';
import { authErrorMessage } from './accountErrors';
import styles from './Account.module.scss';

interface RegisterFlowProps {
  backend: AuthBackend;
  onBackToSignIn: () => void;
  // Fired once the "I've verified - sign in" retry logs the user in. The
  // caller owns what "signed in" means here (in-app: refresh the accounts
  // hook so AccountView swaps to the signed-in page; public: navigate to
  // /account) - this component only performs the login call itself.
  onSignedIn: () => void;
}

// Owns the create-account form and the post-submit "check your email, then
// retry sign-in" phase. A self-contained flow (like ForgotPasswordFlow) so
// its state resets whenever the parent re-enters the register subtab.
export function RegisterFlow({ backend, onBackToSignIn, onSignedIn }: RegisterFlowProps) {
  const { t } = useTranslation();
  const [pendingCreds, setPendingCreds] = useState<{ email: string; password: string } | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const handleRetryVerify = async () => {
    if (!pendingCreds) return;
    setRetrying(true);
    setRetryError(null);
    const result = await backend.login(pendingCreds.email, pendingCreds.password);
    setRetrying(false);
    if (result.status >= 200 && result.status < 300) {
      onSignedIn();
      return;
    }
    const code = result.body?.msg;
    setRetryError(code === 'email_unverified' ? t('account.verify.stillUnverified') : authErrorMessage(t, code));
  };

  if (pendingCreds) {
    return (
      <div className={styles.wrap}>
        <h1 className={styles.title}>{t('account.create.verifyTitle')}</h1>
        <div className={styles.pendingBlock}>
          <p className={styles.subtitle}>{t('account.verify.pendingMessage')}</p>
          {retryError && <p className={styles.error} role="alert">{retryError}</p>}
          <Button type="button" tone="accent" loading={retrying} onClick={() => void handleRetryVerify()}>
            {t('account.create.verifiedRetry')}
          </Button>
          <button type="button" className={styles.linkBtn} onClick={onBackToSignIn}>
            {t('account.signIn.backToSignIn')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>{t('account.create.title')}</h1>
      <p className={styles.subtitle}>{t('account.create.subtitle')}</p>
      <CreateAccountForm
        backend={backend}
        onSuccess={(email, password) => { setRetryError(null); setPendingCreds({ email, password }); }}
      />
      <div className={styles.links}>
        <button type="button" className={styles.linkBtn} onClick={onBackToSignIn}>
          {t('account.signIn.backToSignIn')}
        </button>
      </div>
    </div>
  );
}
