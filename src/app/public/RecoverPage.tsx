import { useState, type FormEvent } from 'react';
import { useTranslation } from '../../lib/i18n';
import { completeRecovery } from '../../api/account';
import { Button } from '../../components/common/Button/Button';
import { TextInput } from '../../components/common/TextInput/TextInput';
import { PublicPageFrame } from './PublicPageFrame';
import { AuthResultCard } from './AuthResultCard';
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
 * be approved by opening it. Every grant carries one, so the page opens on the
 * form and never completes on its own.
 */
export function RecoverPage({ token }: { token: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<RecoverState>(token ? { phase: 'code' } : { phase: 'invalid' });
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim() || submitting) return;
    setSubmitting(true);
    const result = await completeRecovery(token, code.trim());
    setSubmitting(false);
    setCode('');
    if (result.ok && result.username) {
      setState({ phase: 'success', username: result.username });
      return;
    }
    if (result.reason === 'code-mismatch') {
      setState({ phase: 'code', attemptsLeft: result.attemptsLeft });
      return;
    }
    if (result.reason === 'code-exhausted') {
      setState({ phase: 'exhausted' });
      return;
    }
    setState({ phase: 'invalid' });
  };

  return (
    <PublicPageFrame>
      {state.phase === 'code' && (
        <form className={styles.codeForm} onSubmit={handleSubmit}>
          <h1 className={styles.title}>{t('auth.recover.code.title')}</h1>
          <p className={styles.body}>{t('auth.recover.code.body')}</p>
          <TextInput
            value={code}
            onInput={setCode}
            name="code"
            autoComplete="one-time-code"
            ariaLabel={t('auth.recover.code.label')}
          />
          {state.attemptsLeft !== undefined && (
            <p className={styles.error}>
              {t('auth.recover.code.wrong', { count: String(state.attemptsLeft) })}
            </p>
          )}
          <Button type="submit" tone="accent" disabled={!code.trim() || submitting}>
            {t('auth.recover.code.submit')}
          </Button>
        </form>
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
        <AuthResultCard title={t('auth.recover.invalid.title')} body={t('auth.recover.invalid.body')} showBackLink />
      )}
    </PublicPageFrame>
  );
}
