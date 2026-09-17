import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../lib/i18n';
import { completeRecovery } from '../../api/account';
import { Spinner } from '../../components/common/Spinner/Spinner';
import { TextInput } from '../../components/common/TextInput/TextInput';
import { PublicPageFrame } from './PublicPageFrame';
import { AuthResultCard } from './AuthResultCard';
import { normalizeRecoveryCode, RECOVERY_CODE_LENGTH } from './recoveryCode';
import styles from './RecoverPage.module.scss';

type RecoverState =
  | { phase: 'code'; attemptsLeft?: number }
  | { phase: 'exhausted' }
  | { phase: 'success'; username: string }
  | { phase: 'invalid' };

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
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);

  const submit = useCallback(async (value: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    const result = await completeRecovery(token, value);
    inFlight.current = false;
    setSubmitting(false);
    setCode('');
    if (result.ok && result.username) {
      setState({ phase: 'success', username: result.username });
    } else if (result.reason === 'code-mismatch') {
      setState({ phase: 'code', attemptsLeft: result.attemptsLeft });
    } else if (result.reason === 'code-exhausted') {
      setState({ phase: 'exhausted' });
    } else {
      setState({ phase: 'invalid' });
    }
  }, [token]);

  useEffect(() => {
    if (code.length === RECOVERY_CODE_LENGTH) void submit(code);
  }, [code, submit]);

  const retry = () => {
    setCode('');
    setState({ phase: 'code' });
  };

  return (
    <PublicPageFrame>
      {state.phase === 'code' && (
        <div className={styles.codeForm}>
          <h1 className={styles.title}>{t('auth.recover.code.title')}</h1>
          <p className={styles.body}>{t('auth.recover.code.body')}</p>
          <div className={styles.codeField}>
            <TextInput
              value={code}
              onInput={v => setCode(normalizeRecoveryCode(v))}
              name="code"
              autoComplete="one-time-code"
              align="center"
              mono
              maxLength={RECOVERY_CODE_LENGTH}
              disabled={submitting}
              ariaLabel={t('auth.recover.code.label')}
            />
          </div>
          {submitting && <Spinner size={18} />}
          {!submitting && state.attemptsLeft !== undefined && (
            <p className={styles.error}>
              {t('auth.recover.code.wrong', { count: String(state.attemptsLeft) })}
            </p>
          )}
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
