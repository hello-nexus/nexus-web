import { useEffect, useState, type CSSProperties } from 'react';
import { Lock, QrCode, RefreshCw, Smartphone } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import type { ConnectionState } from '../../hooks/useServiceStatus';
import type { PanelSurface } from '../types';
import { wiredPanelClass } from '../device/wiredPanel';
import { hasNativeFindComputerBridge, openFindComputer } from '../device/panelNativeBridge';
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
   * True when this panel was connected over the cloud relay and the host turned
   * the cloud relay OFF (Pair Remote stays on). Like remoteDisabled the hook is
   * already slow-polling for re-enable and reconnects automatically; we just
   * surface a distinct "relay turned off" popup in the meantime.
   */
  relayDisabled: boolean;
  /**
   * True when this specific phone session was removed by the host
   * (single-device revoke). Terminal - the only action is to re-pair.
   * Trumps both connection state and remoteDisabled because re-pairing is
   * the only path forward; auto-polling for the host to "turn it back on"
   * would never succeed.
   */
  sessionRevoked: boolean;
  /**
   * True after the user chose "Disconnect" on the direct-upgrade-failed
   * prompt. Terminal like sessionRevoked - the connection is torn down and
   * only re-pairing brings the panel back.
   */
  sessionEnded: boolean;
  onRetry: () => void;
  onOpenNativePairing: () => void;
}

// No bare `/r/pair` link anywhere here: PairRedirect requires host + pair
// params and renders its invalid-link page without them, so every one of these
// buttons was a guaranteed dead end. Pairing a new system is a native-wrapper
// surface (its QR scanner); a plain browser has none, so the affordance is
// hidden there and the card's copy stands on its own.

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
  relayDisabled,
  sessionRevoked,
  sessionEnded,
  onRetry,
  onOpenNativePairing,
}: PanelOfflineOverlayProps) {
  const { t } = useTranslation();
  const secondsLeft = useCountdownSeconds(nextAttemptAt);
  const canPairNewSystem = hasNativeFindComputerBridge();

  // Q-series stays mounted across host outages (qshell keeps the WebView) and
  // has no touch, so it shows no overlay: the panel itself swaps its rendered
  // widget to the clock on disconnect (see PanelApp's allFiltered) and keeps
  // its background, then restores the configured widgets on reconnect.
  if (surface === 'q60') return null;

  if (sessionEnded) {
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
          <h2 id="panel-offline-title" className={styles.title}>{t('connection.sessionEnded.title')}</h2>
          <p className={styles.message}>{t('connection.sessionEnded.message')}</p>
          <div className={styles.actions}>
            {canPairNewSystem && (
              <button type="button" className={styles.primaryButton} onClick={openFindComputer}>
                <QrCode size={15} />
                <span>{t('connection.sessionRevoked.pairAgain')}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

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
            {canPairNewSystem && (
              <button type="button" className={styles.primaryButton} onClick={openFindComputer}>
                <QrCode size={15} />
                <span>{t('connection.sessionRevoked.pairAgain')}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (relayDisabled) {
    // Host turned the cloud relay OFF while we were connected over it. Reuses
    // the device-removed visual treatment (lock card + status line), but the
    // copy is about the cloud relay and the hook is already slow-polling for
    // re-enable, so a re-check line + manual retry mirror the remoteDisabled
    // card. Auto-reconnects the moment the host flips the relay back on.
    const retryLine = secondsLeft != null
      ? t('connection.relayDisabled.checkingIn', { seconds: secondsLeft })
      : t('connection.relayDisabled.checking');
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
          <h2 id="panel-offline-title" className={styles.title}>{t('connection.relayDisabled.title')}</h2>
          <p className={styles.message}>{t('connection.relayDisabled.message')}</p>
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

  const wiredClass = wiredPanelClass(surface);
  if (wiredClass !== null) {
    return (
      <div
        className={`panel-root ${styles.overlay}`}
        data-theme={resolvedThemeMode}
        data-surface={surface}
        style={themeStyle}
        role="status"
        aria-live="polite"
      >
        <div className={`panel-card ${styles.card}`}>
          <div className={styles.spinner} aria-hidden="true" />
          <p className={styles.statusLine}>
            {wiredClass === 'cabled' ? t('connection.lost.checkUsb') : t('connection.lost.reconnectingWired')}
          </p>
        </div>
      </div>
    );
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
          {surface === 'phone' && canPairNewSystem && (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={openFindComputer}
            >
              <QrCode size={15} />
              <span>{t('connection.lost.newDevice')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
