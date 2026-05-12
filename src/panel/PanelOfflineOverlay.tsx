import { useEffect, useState, type CSSProperties } from 'react';
import { Lock, QrCode, RefreshCw, Smartphone } from 'lucide-react';
import { useTranslation } from '../lib/i18n';
import type { ConnectionState } from '../hooks/useServiceStatus';
import type { PanelSurface } from './types';
import styles from './PanelOfflineOverlay.module.scss';

interface PanelOfflineOverlayProps {
  state: ConnectionState;
  surface: PanelSurface;
  resolvedThemeMode: 'dark' | 'light';
  themeStyle: CSSProperties;
  nativeBridgeAvailable: boolean;
  /** Wall-clock ms when the next reconnect attempt fires; null while a connect is in flight or socket is open. */
  nextAttemptAt: number | null;
  /**
   * True when the host has turned off Pair Remote. Trumps the connection
   * state - the service is reachable, but our session is locked out, so we
   * render a distinct "disabled by host" surface instead of the generic
   * "service offline" copy.
   */
  remoteDisabled: boolean;
  onRetry: () => void;
  onOpenNativePairing: () => void;
}

const NEW_DEVICE_HREF = '/r/pair';

/** Returns whole seconds remaining until target. The internal tick runs faster
 *  than once a second so the displayed integer transitions close to the actual
 *  Math.ceil() boundary instead of drifting by up to a second. */
function useCountdownSeconds(target: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (target == null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [target]);
  if (target == null) return null;
  const remaining = Math.ceil((target - now) / 1000);
  return remaining > 0 ? remaining : null;
}

export function PanelOfflineOverlay({
  state,
  surface,
  resolvedThemeMode,
  themeStyle,
  nativeBridgeAvailable,
  nextAttemptAt,
  remoteDisabled,
  onRetry,
  onOpenNativePairing,
}: PanelOfflineOverlayProps) {
  const { t } = useTranslation();
  const secondsLeft = useCountdownSeconds(nextAttemptAt);

  if (remoteDisabled) {
    // Host disabled Pair Remote. Hook is already slow-polling for re-enable,
    // so we just need to keep the panel coherent (no stale data, clear copy).
    const retryLine = secondsLeft != null
      ? t('connection.remoteDisabled.checkingIn', { seconds: secondsLeft })
      : t('connection.remoteDisabled.checking');
    return (
      <div
        className={`panel-root ${styles.overlay}`}
        data-theme={resolvedThemeMode}
        data-surface={surface}
        style={themeStyle}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="panel-offline-title"
      >
        <div className={`panel-card ${styles.card}`}>
          <div className={styles.lockIcon} aria-hidden="true"><Lock size={28} /></div>
          <h2 id="panel-offline-title" className={styles.title}>{t('connection.remoteDisabled.title')}</h2>
          <p className={styles.message}>{t('connection.remoteDisabled.message')}</p>
          <p className={styles.statusLine} aria-live="polite">{retryLine}</p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={onRetry}
            >
              <RefreshCw size={15} />
              <span>{t('connection.lost.retry')}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'online') return null;

  if (state === 'checking') {
    return <div className={styles.checkingStrip} aria-hidden="true" />;
  }

  const title = t('connection.lost.title');
  const message = state === 'offline'
    ? t('connection.lost.notInstalled')
    : t('connection.lost.message');
  const statusLine = secondsLeft != null
    ? t('connection.lost.reconnectingIn', { seconds: secondsLeft })
    : t('connection.lost.reconnecting');

  return (
    <div
      className={`panel-root ${styles.overlay}`}
      data-theme={resolvedThemeMode}
      data-surface={surface}
      style={themeStyle}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="panel-offline-title"
    >
      <div className={`panel-card ${styles.card}`}>
        <div className={styles.spinner} aria-hidden="true" />
        <h2 id="panel-offline-title" className={styles.title}>{title}</h2>
        <p className={styles.message}>{message}</p>
        <p className={styles.statusLine} aria-live="polite">{statusLine}</p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={onRetry}
          >
            <RefreshCw size={15} />
            <span>{t('connection.lost.retry')}</span>
          </button>
          {surface === 'phone' && nativeBridgeAvailable && (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={onOpenNativePairing}
            >
              <Smartphone size={15} />
              <span>{t('connection.lost.pickDevice')}</span>
            </button>
          )}
          {surface === 'phone' && (
            <a
              className={styles.secondaryButton}
              href={NEW_DEVICE_HREF}
            >
              <QrCode size={15} />
              <span>{t('connection.lost.newDevice')}</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
