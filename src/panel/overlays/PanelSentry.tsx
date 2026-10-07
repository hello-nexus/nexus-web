import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { X } from 'lucide-react';
import { Button } from '../../components/common/Button/Button';
import { armSentry, disarmSentry, fetchSentry, registerPhonePush, type SentryState } from '../../api/sentry';
import { useTranslation } from '../../lib/i18n';
import { useNativePush } from '../device/panelNativeBridge';
import { buildPushRegistration } from './sentryRegistration';
import styles from './PanelSentry.module.scss';

const POLL_MS = 5000;
const FINAL_PUSH_STATUSES = new Set([400, 404, 422]);
// A successful arm holds the arming state at least this long, even when the service answers at once.
const MIN_ARM_MS = 1000;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function SentryMark() {
  return (
    <svg className={styles.svg} viewBox="0 0 24 24" aria-hidden="true">
      <path
        className={`${styles.ln} ${styles.shield}`}
        d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"
      />
      <circle className={styles.idleDot} cx="12" cy="12.2" r="1.5" fill="currentColor" />
      <g className={styles.eye}>
        <path className={styles.ln} d="M7.6 12.2c2.6-3.4 6.2-3.4 8.8 0-2.6 3.4-6.2 3.4-8.8 0z" />
        <circle className={styles.pupil} cx="12" cy="12.2" r="1.3" fill="currentColor" />
      </g>
    </svg>
  );
}

interface PanelSentryProps {
  enabled: boolean;
  resolvedThemeMode: 'dark' | 'light';
  themeStyle: CSSProperties;
  // Bumped by the tray's Sentry row; each change opens the card even if it was dismissed.
  openRequest?: number;
  onSupportedChange?: (supported: boolean) => void;
}

// Phone panel: registers this phone's push target on every load. The Sentry card
// shows while the PC is locked or armed (until dismissed, until the next lock),
// and on demand from the tray row at any time while Sentry is supported.
export function PanelSentry({ enabled, resolvedThemeMode, themeStyle, openRequest = 0, onSupportedChange }: PanelSentryProps) {
  const { t } = useTranslation();
  const push = useNativePush(enabled);
  const [state, setState] = useState<SentryState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'failed' | null>(null);
  const [refusesLock, setRefusesLock] = useState(false);
  const [arming, setArming] = useState<'lock' | 'arm' | null>(null);
  const busyRef = useRef(false);

  const registration = enabled ? buildPushRegistration(push.status, t) : null;
  const registrationJson = registration ? JSON.stringify(registration) : null;
  const registrationRef = useRef(registrationJson);
  const sentRef = useRef<string | null>(null);
  const pushingRef = useRef(false);
  const [registered, setRegistered] = useState(false);

  // Re-sent on every poll tick until a PUT succeeds: the tunnel can be down at load.
  const syncPush = useCallback(async () => {
    const json = registrationRef.current;
    if (!json || sentRef.current === json || pushingRef.current) return;
    pushingRef.current = true;
    try {
      const status = await registerPhonePush(JSON.parse(json)).catch(() => 0);
      if (registrationRef.current !== json) return;
      // Only a rejected payload or a gone session is final until the registration changes; anything else
      // (transport, 401/403 while Remote is off, 429, 5xx) retries on the next tick.
      const ok = status >= 200 && status < 300;
      if (!ok && !FINAL_PUSH_STATUSES.has(status)) return;
      sentRef.current = json;
      if (ok) setRegistered(true);
    } finally {
      pushingRef.current = false;
    }
  }, []);

  useEffect(() => {
    registrationRef.current = registrationJson;
    sentRef.current = null;
    setRegistered(false);
    void syncPush();
  }, [registrationJson, syncPush]);

  const actionSeqRef = useRef(0);
  const readingRef = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const read = async () => {
      if (document.hidden) return;
      void syncPush();
      if (busyRef.current || readingRef.current) return;
      readingRef.current = true;
      const seq = actionSeqRef.current;
      try {
        const next = await fetchSentry().catch(() => null);
        if (cancelled || busyRef.current || seq !== actionSeqRef.current || !next) return;
        setState(next);
      } finally {
        readingRef.current = false;
      }
    };
    void read();
    const timer = window.setInterval(() => { void read(); }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, syncPush]);

  // Dismissal lasts until the PC's next lock transition; `opened` is the tray row forcing the card up.
  const [dismissed, setDismissed] = useState(false);
  const [opened, setOpened] = useState(false);
  const lockedRef = useRef<boolean | null>(null);
  const openRequestRef = useRef(openRequest);
  const locked = state ? state.locked : null;
  useEffect(() => {
    if (locked === null) return;
    if (locked && lockedRef.current === false) setDismissed(false);
    lockedRef.current = locked;
  }, [locked]);
  useEffect(() => {
    if (openRequestRef.current === openRequest) return;
    openRequestRef.current = openRequest;
    setDismissed(false);
    setOpened(true);
  }, [openRequest]);

  const supported = state?.supported ?? false;
  useEffect(() => {
    onSupportedChange?.(enabled && supported);
  }, [enabled, supported, onSupportedChange]);

  const visible = enabled && state !== null && state.supported
    && (opened || (!dismissed && (state.locked || state.armed)));
  useEffect(() => {
    if (!visible) setError(null);
  }, [visible]);

  const dismiss = () => {
    setDismissed(true);
    setOpened(false);
  };

  const run = useCallback(async (action: () => Promise<SentryState | null>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      if (next) { actionSeqRef.current += 1; setState(next); }
      else setError('failed');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const alerts = !push.available ? null : push.status?.permission ?? 'prompt';

  const arm = async () => {
    if (busyRef.current || !state || state.armed) return;
    const lock = !state.locked;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setArming(lock ? 'lock' : 'arm');
    const startedAt = Date.now();
    try {
      // Fire-and-forget: arming does not depend on the permission result.
      if (alerts === 'prompt') push.requestPermission();
      const result = await armSentry(lock);
      if (result.ok) {
        const remaining = prefersReducedMotion() ? 0 : MIN_ARM_MS - (Date.now() - startedAt);
        if (remaining > 0) await new Promise<void>((resolve) => { window.setTimeout(resolve, remaining); });
        actionSeqRef.current += 1;
        setState(result.state);
        return;
      }
      if (result.reason === 'desktop_only') {
        setRefusesLock(true);
        return;
      }
      setError('failed');
      if (result.reason === 'not_locked') {
        // Refresh so the card reflects the PC being unlocked meanwhile.
        const next = await fetchSentry().catch(() => null);
        if (next) { actionSeqRef.current += 1; setState(next); }
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
      setArming(null);
    }
  };

  if (!visible || !state) return null;

  const phase = state.armed ? 'armed' : arming ? 'arming' : 'idle';
  const idle = phase === 'idle' && (state.locked || !refusesLock);
  const title = state.armed ? t('sentry.card.armedTitle') : t('sentry.card.title');
  const message = state.armed ? t('sentry.card.armed')
    : arming === 'lock' ? t('sentry.card.lockingPc')
    : arming === 'arm' ? t('sentry.card.armingSentry')
    : state.locked ? t('sentry.card.locked')
    : refusesLock ? t('sentry.card.notLocked')
    : t('sentry.card.promptLock');
  const primaryLabel = arming === 'lock' ? t('sentry.card.locking')
    : arming === 'arm' ? t('sentry.card.arming')
    : state.locked || refusesLock ? t('sentry.card.arm')
    : t('sentry.card.lockAndArm');
  const alertsOn = alerts === 'granted' && registered;
  const alertsText = alerts === 'denied' ? t('sentry.card.alertsDenied')
    : alertsOn ? t('sentry.card.alertsOn')
    : alerts === 'prompt' && !state.armed ? t('sentry.card.alertsSetup')
    : null;

  return (
    <div
      className={`panel-root ${styles.wrap}`}
      data-theme={resolvedThemeMode}
      style={themeStyle}
    >
      <section
        className={`panel-card ${styles.card}`}
        data-state={phase}
        aria-labelledby="panel-sentry-title"
      >
        <Button
          className={styles.close}
          type="button"
          tone="neutral"
          icon={<X />}
          aria-label={t('app.window.close')}
          title={t('app.window.close')}
          onClick={dismiss}
        />
        <button
          type="button"
          className={styles.mark}
          aria-label={state.armed ? title : primaryLabel}
          disabled={!idle}
          onClick={() => { void arm(); }}
        >
          <span className={styles.pulse} aria-hidden="true" />
          <SentryMark />
        </button>
        <h2 id="panel-sentry-title" className={styles.title}>{title}</h2>
        <p className={styles.message}>{message}</p>
        {alertsText && (
          <p className={`${styles.alerts} ${alertsOn ? '' : styles.alertsOff}`}>
            <span className={styles.alertsDot} aria-hidden="true" />
            <span>{alertsText}</span>
          </p>
        )}
        {error === 'failed' && <p className={styles.error} role="alert">{t('sentry.card.failed')}</p>}
        {state.armed ? (
          <Button
            className={styles.primary}
            type="button"
            size="lg"
            tone="neutral"
            loading={busy}
            onClick={() => run(() => disarmSentry())}
          >
            {t('sentry.card.disarm')}
          </Button>
        ) : (
          <Button
            className={styles.primary}
            type="button"
            size="lg"
            tone="accent"
            disabled={!idle}
            onClick={() => { void arm(); }}
          >
            {primaryLabel}
          </Button>
        )}
      </section>
    </div>
  );
}
