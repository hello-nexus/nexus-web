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
  /**
   * True when this specific phone session was removed by the host
   * (single-device revoke). Terminal - the only action is to re-pair.
   * Trumps both connection state and remoteDisabled because re-pairing is
   * the only path forward; auto-polling for the host to "turn it back on"
   * would never succeed.
   */
  sessionRevoked: boolean;
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
    // Resync `now` immediately when `target` changes so the displayed
    // countdown reflects the new deadline without waiting up to 250 ms
    // for the first interval tick. Without this the user sees the old
    // remaining time momentarily after each reconnect attempt is scheduled.
     
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
  sessionRevoked,
  onRetry,
  onOpenNativePairing,
}: PanelOfflineOverlayProps) {
  const { t } = useTranslation();
  const secondsLeft = useCountdownSeconds(nextAttemptAt);

  // The Q-series LCD has no touch input, so a "connection lost / retry"
  // card with buttons is unactionable. qshell (the Android host) detects
  // the disconnect on its own /ping monitor and falls back to the OEM
  // rainbow-gradient "THICC Q60/Q80" splash. Showing this overlay first
  // flashes a useless card on screen for ~1 s before qshell unmounts the
  // WebView. Returning null here makes the transition seamless: panel
  // straight to OEM splash, no intermediate state.
  if (surface === 'q60') return null;

  if (sessionRevoked) {
    // Host removed this device from the paired list. No retry / no auto-poll
    // - the session is gone and the only path back is re-pairing. Surface a
    // single, hard "Pair again" link so the user reaches /r/pair in one tap.
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
          <h2 id="panel-offline-title" className={styles.title}>{t('connection.sessionRevoked.title')}</h2>
          <p className={styles.message}>{t('connection.sessionRevoked.message')}</p>
          <div className={styles.actions}>
            <a className={styles.primaryButton} href={NEW_DEVICE_HREF}>
              <QrCode size={15} />
              <span>{t('connection.sessionRevoked.pairAgain')}</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

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
