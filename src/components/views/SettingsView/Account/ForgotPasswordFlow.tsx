import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../../../common/Button/Button';
import { Spinner } from '../../../common/Spinner/Spinner';
import { TextInput } from '../../../common/TextInput/TextInput';
import { useTranslation } from '../../../../lib/i18n';
import type { AuthBackend } from '../../../../api/authBackend';
import styles from './Account.module.scss';

type ForgotPhase = 'email' | 'pending' | 'reset' | 'expired';

interface ForgotPasswordFlowProps {
  backend: AuthBackend;
  onBackToSignIn: () => void;
  // Fired once the recovery poll reports 'approved'. The caller owns
  // switching to the signed-in view (in-app: AccountView flips
  // recoveryFresh + refreshes accounts.activeAccountId; public: the /recover
  // page refreshes its own account state) - this component only shows the
  // transient "signing you in" phase until that happens.
  onRecoveryApproved: () => void;
}

const RECOVERY_POLL_MS = 3000;

export function ForgotPasswordFlow({ backend, onBackToSignIn, onRecoveryApproved }: ForgotPasswordFlowProps) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<ForgotPhase>('email');
  const [email, setEmail] = useState('');
  const [failed, setFailed] = useState(false);
  // Shown only here, never mailed: the user types it into the page the link
  // opens, which is what proves the sign-in waiting for approval is this one.
  const [code, setCode] = useState('');

  useEffect(() => {
    if (phase !== 'pending') return;
    let cancelled = false;
    const poll = async () => {
      const status = await backend.recoveryStatus();
      if (cancelled || !status) return;
      if (status.status === 'approved') {
        setPhase('reset');
        onRecoveryApproved();
      } else if (status.status === 'expired') {
        setPhase('expired');
      }
    };
    void poll();
    const timer = window.setInterval(() => { void poll(); }, RECOVERY_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [phase, backend, onRecoveryApproved]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setFailed(false);
    // A refused start (throttled, offline) sent no link, so advancing to the
    // pending phase would poll for a grant that does not exist and report it as
    // an expired link.
    // No code means an older service or api answered: the page the link opens
    // demands one, so advancing would strand the user with nothing to type.
    const started = await backend.recoveryStart(email.trim());
    if (!started?.code) {
      setFailed(true);
      return;
    }
    setCode(started.code);
    setPhase('pending');
  };

  if (phase === 'email') {
    return (
      <div className={styles.wrap}>
        <h1 className={styles.title}>{t('account.recovery.title')}</h1>
        <p className={styles.subtitle}>{t('account.recovery.subtitle')}</p>
        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t('account.recovery.email')}</span>
            <TextInput
              value={email}
              onInput={setEmail}
              name="email"
              autoComplete="email"
              ariaLabel={t('account.recovery.email')}
            />
          </label>
          {failed && <p className={styles.error}>{t('account.recovery.startFailed')}</p>}
          <Button type="submit" tone="accent" disabled={!email.trim()}>
            {t('account.recovery.submit')}
          </Button>
          <div className={styles.links}>
            <button type="button" className={styles.linkBtn} onClick={onBackToSignIn}>
              {t('account.signIn.backToSignIn')}
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (phase === 'pending') {
    return (
      <div className={styles.wrap}>
        <h1 className={`${styles.title} ${styles.pendingTitle}`}>{t('account.recovery.pendingTitle')}</h1>
        <div className={styles.pendingBlock}>
          <p className={styles.pendingMessage}>{t('account.recovery.pendingMessage', { email })}</p>
          <div className={styles.recoveryCodeBlock}>
            <span className={styles.fieldLabel}>{t('account.recovery.codeTitle')}</span>
            <span className={styles.recoveryCode}>{code}</span>
            <span className={styles.hint}>{t('account.recovery.codeHint')}</span>
          </div>
          <div className={styles.pendingRow}>
            <Spinner size={16} />
            <span className={styles.hint}>{t('account.recovery.pendingWaiting')}</span>
          </div>
          <button
            type="button"
            className={`${styles.linkBtn} ${styles.pendingCancel}`}
            onClick={() => { backend.recoveryCancel?.(); setPhase('email'); }}
          >
            {t('account.recovery.cancel')}
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'expired') {
    return (
      <div className={styles.wrap}>
        <h1 className={styles.title}>{t('account.recovery.expiredTitle')}</h1>
        <p className={styles.subtitle}>{t('account.recovery.expiredMessage')}</p>
        <Button type="button" tone="accent" onClick={() => setPhase('email')}>
          {t('account.recovery.tryAgain')}
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.pendingBlock}>
        <div className={styles.pendingRow}>
          <Spinner size={18} />
          <p className={styles.subtitle}>{t('account.recovery.signingIn')}</p>
        </div>
        <button type="button" className={styles.linkBtn} onClick={onBackToSignIn}>
          {t('account.signIn.backToSignIn')}
        </button>
      </div>
    </div>
  );
}
