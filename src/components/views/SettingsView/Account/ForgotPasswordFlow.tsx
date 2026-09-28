import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '../../../common/Button/Button';
import { Spinner } from '../../../common/Spinner/Spinner';
import { TextInput } from '../../../common/TextInput/TextInput';
import { useTranslation } from '../../../../lib/i18n';
import type { AuthBackend } from '../../../../api/authBackend';
import {
  formatRecoveryCode,
  normalizeRecoveryCode,
  RECOVERY_CODE_DISPLAY_LENGTH,
  RECOVERY_CODE_LENGTH,
} from './recoveryCode';
import styles from './Account.module.scss';

type ForgotPhase = 'email' | 'pending' | 'reset' | 'expired' | 'exhausted';

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
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);
  // Typed here from the page the emailed link opens on another device; the
  // link opened on this computer signs in with no code at all.
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<'wrong' | 'failed' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // The field holds a complete code until the next keystroke, so the submit
  // effect below would post it again on every render without this.
  const posted = useRef<string | null>(null);

  const approve = useCallback(() => {
    setPhase('reset');
    onRecoveryApproved();
  }, [onRecoveryApproved]);

  const submitCode = useCallback(async (value: string) => {
    setSubmitting(true);
    setCodeError(null);
    const result = await backend.recoverySubmitCode(value);
    setSubmitting(false);
    if (result === 'ok') approve();
    else if (result === 'exhausted') setPhase('exhausted');
    else setCodeError(result === 'mismatch' ? 'wrong' : 'failed');
  }, [backend, approve]);

  useEffect(() => {
    if (phase === 'pending' && code.length === RECOVERY_CODE_LENGTH && code !== posted.current) {
      posted.current = code;
      void submitCode(code);
    }
  }, [phase, code, submitCode]);

  useEffect(() => {
    if (phase !== 'pending') return;
    let cancelled = false;
    const poll = async () => {
      const status = await backend.recoveryStatus();
      if (cancelled || !status) return;
      if (status.status === 'approved') {
        approve();
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
  }, [phase, backend, approve]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setFailed(false);
    // A refused start (throttled, offline) sent no link, so advancing to the
    // pending phase would poll for a grant that does not exist and report it as
    // an expired link.
    if (!(await backend.recoveryStart(email.trim()))) {
      setFailed(true);
      return;
    }
    setCode('');
    setCodeError(null);
    posted.current = null;
    setResent(false);
    setPhase('pending');
  };

  // A new start replaces the grant, so only the newest email's link works.
  const resend = async () => {
    if (resending || submitting) return;
    setResending(true);
    setFailed(false);
    setResent(false);
    const started = await backend.recoveryStart(email.trim());
    setResending(false);
    if (!started) {
      setFailed(true);
      return;
    }
    setCode('');
    setCodeError(null);
    posted.current = null;
    setResent(true);
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
          <p className={styles.hint}>
            {t('account.recovery.resendPrompt')}{' '}
            <button type="button" className={styles.linkBtn} disabled={resending || submitting} onClick={() => void resend()}>
              {t('account.recovery.resend')}
            </button>
          </p>
          {resent && <p className={styles.hint} role="status">{t('account.recovery.resent')}</p>}
          {failed && <p className={styles.error} role="alert">{t('account.recovery.startFailed')}</p>}
          <p className={styles.hint}>{t('account.recovery.pendingHowTo')}</p>
          <label className={`${styles.field} ${styles.recoveryCodeField} ${codeError === 'wrong' ? styles.recoveryCodeWrong : ''}`}>
            <span className={styles.fieldLabel}>{t('account.recovery.codeTitle')}</span>
            <TextInput
              value={formatRecoveryCode(code)}
              sanitize={v => formatRecoveryCode(normalizeRecoveryCode(v))}
              onInput={v => { setCodeError(null); setCode(normalizeRecoveryCode(v)); }}
              name="code"
              autoComplete="one-time-code"
              align="center"
              mono
              maxLength={RECOVERY_CODE_DISPLAY_LENGTH}
              disabled={submitting}
              invalid={codeError === 'wrong'}
              ariaLabel={t('account.recovery.codeTitle')}
            />
          </label>
          {codeError && (
            <p className={styles.error} role="alert">
              {t(codeError === 'wrong' ? 'account.recovery.codeWrong' : 'account.error.generic')}
            </p>
          )}
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

  if (phase === 'expired' || phase === 'exhausted') {
    const exhausted = phase === 'exhausted';
    return (
      <div className={styles.wrap}>
        <h1 className={styles.title}>{t(exhausted ? 'account.recovery.exhaustedTitle' : 'account.recovery.expiredTitle')}</h1>
        <p className={styles.subtitle}>{t(exhausted ? 'account.recovery.exhaustedMessage' : 'account.recovery.expiredMessage')}</p>
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
