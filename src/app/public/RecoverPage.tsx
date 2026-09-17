import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../lib/i18n';
import { completeRecovery, type RecoveryCompleteFailure } from '../../api/account';
import { Spinner } from '../../components/common/Spinner/Spinner';
import { TextInput } from '../../components/common/TextInput/TextInput';
import { PublicPageFrame } from './PublicPageFrame';
import { AuthResultCard } from './AuthResultCard';
import {
  formatRecoveryCode,
  normalizeRecoveryCode,
  RECOVERY_CODE_DISPLAY_LENGTH,
  RECOVERY_CODE_LENGTH,
} from './recoveryCode';
import styles from './RecoverPage.module.scss';

type RecoverState =
  | { phase: 'code'; attemptsLeft?: number }
  /** The rejected code is still on screen, marked wrong, before the field clears. */
  | { phase: 'rejected'; reason: RecoveryCompleteFailure; attemptsLeft?: number }
  /** The check draws before the signed-in card replaces it. */
  | { phase: 'approved'; username: string }
  | { phase: 'exhausted' }
  | { phase: 'success'; username: string }
  | { phase: 'invalid' };

/** Long enough to read the mark or the message, short enough not to be a wait. */
const HOLD_MS = 1100;

/**
 * /auth/recover?token=... - lost-password magic-link landing. No password
 * form here: completing recovery signs the device-grant-polling Nexus app
 * in, and the app owns setting the new password from there.
 *
 * The code step is what makes a click safe to perform: the code lives only on
 * the device that asked for the reset, so a link arriving unrequested cannot
 * be approved by opening it. There is nothing to press - the last character
 * submits, since a code of a known length has no other move after it.
 */
export function RecoverPage({ token }: { token: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<RecoverState>(token ? { phase: 'code' } : { phase: 'invalid' });
  // Held as the api mints it; the dash is put back for display only.
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  // The code stays on screen through the rejected beat, so the effect below
  // would post it again on every render without this.
  const posted = useRef<string | null>(null);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (hold.current) clearTimeout(hold.current); }, []);

  const submit = useCallback(async (value: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    const result = await completeRecovery(token, value);
    inFlight.current = false;
    setSubmitting(false);
    if (result.ok && result.username) {
      const username = result.username;
      setState({ phase: 'approved', username });
      hold.current = setTimeout(() => setState({ phase: 'success', username }), HOLD_MS);
      return;
    }
    const reason = result.reason ?? 'invalid';
    setState({ phase: 'rejected', reason, attemptsLeft: result.attemptsLeft });
    hold.current = setTimeout(() => {
      if (reason === 'code-exhausted') {
        setState({ phase: 'exhausted' });
      } else if (reason === 'invalid') {
        setState({ phase: 'invalid' });
      } else {
        setCode('');
        posted.current = null;
        setState({ phase: 'code', attemptsLeft: result.attemptsLeft });
      }
    }, HOLD_MS);
  }, [token]);

  useEffect(() => {
    if (code.length === RECOVERY_CODE_LENGTH && code !== posted.current) {
      posted.current = code;
      void submit(code);
    }
  }, [code, submit]);

  const retry = () => {
    setCode('');
    posted.current = null;
    setState({ phase: 'code' });
  };

  const entering = state.phase === 'code' || state.phase === 'rejected';
  const rejected = state.phase === 'rejected';

  return (
    <PublicPageFrame>
      {entering && (
        <div className={styles.codeForm}>
          <h1 className={styles.title}>{t('auth.recover.code.title')}</h1>
          <p className={styles.body}>{t('auth.recover.code.body')}</p>
          <div className={`${styles.codeField} ${rejected ? styles.codeFieldWrong : ''}`}>
            <TextInput
              value={formatRecoveryCode(code)}
              sanitize={v => formatRecoveryCode(normalizeRecoveryCode(v))}
              onInput={v => setCode(normalizeRecoveryCode(v))}
              name="code"
              autoComplete="one-time-code"
              align="center"
              mono
              maxLength={RECOVERY_CODE_DISPLAY_LENGTH}
              disabled={submitting || rejected}
              invalid={rejected}
              ariaLabel={t('auth.recover.code.label')}
            />
          </div>
          {submitting && <Spinner size={18} />}
          {rejected && (
            <p className={styles.error} role="alert">
              {state.reason === 'code-mismatch' && state.attemptsLeft !== undefined
                ? t('auth.recover.code.wrong', { count: String(state.attemptsLeft) })
                : t('auth.recover.invalid.title')}
            </p>
          )}
        </div>
      )}
      {state.phase === 'approved' && (
        <div className={styles.approved}>
          <svg className={styles.check} viewBox="0 0 52 52" aria-hidden>
            <circle className={styles.checkCircle} cx="26" cy="26" r="24" />
            <path className={styles.checkMark} d="M15 27l7.5 7.5L37 19" />
          </svg>
          <p className={styles.body}>{t('auth.recover.success.title')}</p>
        </div>
      )}
      {state.phase === 'exhausted' && (
        <AuthResultCard
          title={t('auth.recover.code.exhaustedTitle')}
          body={t('auth.recover.code.exhausted')}
          showBackLink
        />
      )}
      {state.phase === 'success' && (
        <AuthResultCard
          title={t('auth.recover.success.title')}
          body={t('auth.recover.success.body', { username: state.username })}
          showBackLink
        />
      )}
      {state.phase === 'invalid' && (
        <AuthResultCard
          title={t('auth.recover.invalid.title')}
          body={t('auth.recover.invalid.body')}
          action={{ label: t('account.recovery.tryAgain'), onClick: retry }}
        />
      )}
    </PublicPageFrame>
  );
}
