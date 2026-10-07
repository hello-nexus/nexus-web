import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Button } from '../../components/common/Button/Button';
import { armSentry, disarmSentry, fetchSentry, registerPhonePush, type SentryState } from '../../api/sentry';
import { useTranslation } from '../../lib/i18n';
import { useNativePush } from '../device/panelNativeBridge';
import { buildPushRegistration, sentryCardVisible } from './sentryRegistration';
import styles from './PanelSentry.module.scss';

const POLL_MS = 5000;

interface PanelSentryProps {
  enabled: boolean;
  resolvedThemeMode: 'dark' | 'light';
  themeStyle: CSSProperties;
}

// Phone panel: registers this phone's push target on every load and shows the
// Sentry card while the PC is locked.
export function PanelSentry({ enabled, resolvedThemeMode, themeStyle }: PanelSentryProps) {
  const { t } = useTranslation();
  const push = useNativePush(enabled);
  const [state, setState] = useState<SentryState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'notLocked' | 'failed' | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const read = async () => {
      if (busyRef.current) return;
      const next = await fetchSentry().catch(() => null);
      if (cancelled || busyRef.current || !next) return;
      setState(next);
    };
    void read();
    const timer = window.setInterval(() => { void read(); }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled]);

  const registration = enabled ? buildPushRegistration(push.status, t) : null;
  const registrationJson = registration ? JSON.stringify(registration) : null;
  useEffect(() => {
    if (!registrationJson) return;
    void registerPhonePush(JSON.parse(registrationJson)).catch(() => null);
  }, [registrationJson]);

  const run = useCallback(async (action: () => Promise<SentryState | null>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      if (next) setState(next);
      else setError('failed');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const arm = () => run(async () => {
    const result = await armSentry(false);
    if (result.ok) return result.state;
    if (result.reason === 'not_locked') {
      setError('notLocked');
      // Refresh so the card drops away if the PC was unlocked meanwhile.
      return fetchSentry().catch(() => null);
    }
    return null;
  });

  if (!enabled || !sentryCardVisible(state)) return null;

  const alerts = !push.available ? null : push.status?.permission ?? 'prompt';
  const errorText = error === 'notLocked' ? t('sentry.card.notLocked')
    : error === 'failed' ? t('sentry.card.failed')
    : null;

  return (
    <div
      className={`panel-root ${styles.wrap}`}
      data-theme={resolvedThemeMode}
      style={themeStyle}
    >
      <section className={`panel-card ${styles.card}`} aria-labelledby="panel-sentry-title">
        <div className={styles.header}>
          <span className={styles.icon} aria-hidden="true"><ShieldAlert size={18} /></span>
          <h2 id="panel-sentry-title" className={styles.title}>{t('sentry.card.title')}</h2>
        </div>
        <p className={styles.message}>
          {state.armed ? t('sentry.card.armed') : t('sentry.card.locked')}
        </p>
        {alerts === 'prompt' && (
          <p className={styles.message}>{t('sentry.card.alertsHint')}</p>
        )}
        {alerts === 'denied' && (
          <p className={styles.message}>{t('sentry.card.alertsDenied')}</p>
        )}
        {alerts === 'granted' && (
          <p className={styles.message}>{t('sentry.card.alertsOn')}</p>
        )}
        {errorText && <p className={styles.error} role="alert">{errorText}</p>}
        <div className={styles.actions}>
          {alerts === 'prompt' && (
            <Button type="button" tone="neutral" onClick={push.requestPermission}>
              {t('sentry.card.enableAlerts')}
            </Button>
          )}
          {state.armed ? (
            <Button
              type="button"
              tone="neutral"
              loading={busy}
              onClick={() => run(() => disarmSentry())}
            >
              {t('sentry.card.disarm')}
            </Button>
          ) : (
            <Button type="button" tone="accent" loading={busy} onClick={arm}>
              {t('sentry.card.arm')}
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
