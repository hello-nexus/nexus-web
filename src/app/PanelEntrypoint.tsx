import { useCallback, useEffect, useMemo, useState } from 'react';
import PanelApp from '../panel/PanelApp';
import { Spinner } from '../components/common/Spinner/Spinner';
import { PanelSimulatorContent } from '../panel/embed/PanelSimulatorContent';
import { inferSurfaceFromViewport } from '../panel/device/inferSurface';
import type { PanelSurface } from '../panel/types';
import { isWiredPanel } from '../panel/device/wiredPanel';
import { hasNativeFindComputerBridge, openFindComputer } from '../panel/device/panelNativeBridge';
import {
  allocatePanelDeviceWithStatus,
  patchPanelDeviceWithStatus,
  claimPanelPhonePairing,
} from '../api/panel';
import { storePhoneToken } from '../api/auth';
import { getDeviceId } from '../api/deviceId';
import { upsertPairedPc, markActivePcNeedsRepair } from '../api/pairedPcs';
import { MultiplexContext, useMultiplexConnection } from '../hooks/useMultiplexSocket';
import { UiSettingsProvider } from '../hooks/useUiSettings';
import { TouchViaPointerContext, readTouchViaPointerFlag } from '../panel/engine/touchViaPointer';
import { useTranslation } from '../lib/i18n';
import { useMonitoringStoreBridge } from './monitoringBridge';
import {
  PHONE_PANEL_PWA_KEY,
  forgetCachedPanelDeviceId,
  readCachedPanelDeviceId,
  writeCachedPanelDeviceId,
} from './panelRouting';
import styles from '../App.module.scss';
import { framePacingQuery } from '../lib/framePacer';

type PanelFailureKind = 'auth' | 'network' | 'pair-expired';
type PanelEntrypointState = 'claiming' | 'allocating' | 'ready' | 'failed';

export function PanelWrapper({ deviceId, wired = false }: { deviceId: string; wired?: boolean }) {
  const multiplex = useMultiplexConnection(true, wired);
  useMonitoringStoreBridge(multiplex);
  // Set only by the macOS overlay helper's kiosk URL (engine/touchViaPointer).
  const touchViaPointer = useMemo(() => readTouchViaPointerFlag(), []);
  return (
    <MultiplexContext.Provider value={multiplex}>
      <UiSettingsProvider serviceOnline={true} manageDom={false}>
        <TouchViaPointerContext.Provider value={touchViaPointer}>
          <PanelApp deviceId={deviceId} />
        </TouchViaPointerContext.Provider>
      </UiSettingsProvider>
    </MultiplexContext.Provider>
  );
}

// Iframe-only entrypoint for /panel?simulator=1. The parent modal owns
// layout + theme + selection and feeds the iframe via postMessage. We
// still wire the multiplex provider so widgets that read live monitoring
// frames render with real data from the local service.
export function PanelSimulatorWrapper() {
  const multiplex = useMultiplexConnection(true);
  useMonitoringStoreBridge(multiplex);
  return (
    <MultiplexContext.Provider value={multiplex}>
      <UiSettingsProvider serviceOnline={true} manageDom={false}>
        <PanelSimulatorContent />
      </UiSettingsProvider>
    </MultiplexContext.Provider>
  );
}

export function PanelEntrypoint({ initialDeviceId, isPhonePair, pairToken, pairDeviceId, pairSpki, surfaceHint = null }: {
  initialDeviceId: string | null;
  isPhonePair: boolean;
  pairToken: string | null;
  // Stable per-device id carried on the LAN-direct redirect (?deviceId=) by the
  // remote-origin PairRedirect, so this same-origin claim dedups to the SAME
  // authorized-device session the relay path would have used. Absent on a fresh
  // local-origin scan - fall back to this origin's own stable id.
  pairDeviceId: string | null;
  // The PC's cert fingerprint from the QR's `fp` param, forwarded by
  // PairRedirect's LAN redirect. Absent on a bookmarked/manually-typed
  // /panel/phone?pair= URL - the claim response carries no spki of its own
  // (see PanelPhoneClaimResponse's success branch), so a LAN claim with no
  // forwarded fp has no spki at all for the paired-PC record.
  pairSpki: string | null;
  // From a host that knows which panel it opened (the Linux Y70 kiosk maps on
  // the primary monitor before KWin moves it, so its first viewport reads as a phone).
  surfaceHint?: PanelSurface | null;
}) {
  const { t } = useTranslation();
  const needsPhoneClaim = isPhonePair && Boolean(pairToken);
  const [state, setState] = useState<PanelEntrypointState>(() =>
    needsPhoneClaim
      ? 'claiming'
      : initialDeviceId
      ? 'ready'
      : 'allocating',
  );
  const [deviceId, setDeviceId] = useState<string | null>(initialDeviceId);
  const [failureKind, setFailureKind] = useState<PanelFailureKind>('network');
  const [failureDetail, setFailureDetail] = useState('');
  const [allocAttempt, setAllocAttempt] = useState(0);
  const viewportSurface = useMemo(() => inferSurfaceFromViewport(isPhonePair), [isPhonePair]);
  const inferredSurface = surfaceHint ?? viewportSurface;
  // Snapshot the kiosk's own viewport so the service can pass it on to the
  // dashboard simulator iframe (which otherwise renders against a hardcoded
  // profile that doesn't reflect the user's actual Y70 model + Windows DPI).
  const viewportCapabilities = useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    // Not on its panel yet: keep the record's last real viewport; PanelApp
    // reports this one once the window lands.
    if (viewportSurface !== inferredSurface) return { surface: inferredSurface };
    const dpr = Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0
      ? window.devicePixelRatio
      : 1;
    return {
      surface: inferredSurface,
      cssWidth: Math.max(1, Math.round(window.innerWidth)),
      cssHeight: Math.max(1, Math.round(window.innerHeight)),
      dpr,
    };
  }, [inferredSurface, viewportSurface]);

  // Phone pair flow: claim the QR token, store the session cookie, then fall
  // through to allocate-or-cache a deviceId for this phone.
  useEffect(() => {
    if (!needsPhoneClaim || !pairToken) return;
    let cancelled = false;
    claimPanelPhonePairing(pairToken, pairDeviceId || getDeviceId()).then(result => {
      if (cancelled) return;
      if (result?.paired && result.token) {
        storePhoneToken(result.token);
        localStorage.setItem(PHONE_PANEL_PWA_KEY, '1');
        upsertPairedPc({
          machineName: result.machineName,
          token: result.token,
          spki: pairSpki || undefined,
          host: window.location.hostname,
          httpPort: window.location.port || undefined,
        });
        // Strip the pair token from the URL but stay on /panel/phone for the
        // alloc step below, which will then redirect to /panel/<id>.
        const cleanUrl = `${window.location.origin}/panel/phone`;
        window.history.replaceState(null, '', cleanUrl);
        setState('allocating');
      } else {
        setFailureKind('pair-expired');
        setFailureDetail(result?.error || '');
        setState('failed');
      }
    });
    return () => { cancelled = true; };
  }, [needsPhoneClaim, pairToken, pairDeviceId, pairSpki]);

  // Allocate-or-recover flow: when no deviceId is in the URL, look for one in
  // localStorage (Option A: device caches its own id). Allocate a fresh one
  // if not found, then redirect to the canonical /panel/<id> URL.
  useEffect(() => {
    if (state !== 'allocating') return;
    let cancelled = false;
    const finish = (id: string, persist = true) => {
      if (cancelled) return;
      if (persist) writeCachedPanelDeviceId(id);
      setDeviceId(id);
      // The kiosk host's frame-pacing hint must survive the move to the device URL.
      const target = `${window.location.origin}/panel/${encodeURIComponent(id)}${framePacingQuery(window.location.search)}`;
      window.history.replaceState(null, '', target);
      setState('ready');
    };

    const allocate = async () => {
      const result = await allocatePanelDeviceWithStatus(
        viewportCapabilities ?? { surface: inferredSurface },
      );
      if (cancelled) return;
      if (result.ok) {
        finish(result.record.id);
        return;
      }
      // 401 = no auth context at all (no service token, no phone cookie).
      // 403 = phone session cookie present but server denied; also a
      // not-yet-paired symptom in practice.
      const kind: PanelFailureKind = result.status === 401 || result.status === 403 ? 'auth' : 'network';
      if (kind === 'auth' && !needsPhoneClaim) {
        // Reached 'allocating' via a stored paired-PC token (not a fresh
        // claim) and the PC rejected it - flag that record so the paired-PCs
        // list surfaces a re-pair affordance on it.
        markActivePcNeedsRepair();
      }
      setFailureKind(kind);
      setFailureDetail(result.status ? `HTTP ${result.status}` : t('panel.gate.networkError'));
      setState('failed');
    };

    void (async () => {
      const cached = readCachedPanelDeviceId();
      if (!cached) {
        await allocate();
        return;
      }
      // Verify the cached device still exists server-side. A 404 means the
      // record was dropped (profile wipe, session revoke that took the device
      // with it, manual delete) and trusting the cache would mount the panel
      // against a dead id - usePanelLayout would then 404 and fall back to a
      // default layout that's empty when /defaults hasn't loaded yet. Use the
      // patch as a touch + verify in one round-trip. An unhinted load carries its
      // viewport; a hinted one sends none, as a patched surface would relabel a stale record.
      const patch = !surfaceHint && viewportCapabilities ? { capabilities: viewportCapabilities } : {};
      const result = await patchPanelDeviceWithStatus(cached, patch);
      if (cancelled) return;
      if (!result.ok && result.status === 404) {
        forgetCachedPanelDeviceId(cached);
        await allocate();
        return;
      }
      // A hinted load drops a cached record of another surface and adopts one with none.
      if (result.ok && surfaceHint) {
        const recordSurface = result.record.capabilities?.surface;
        if (recordSurface && recordSurface !== surfaceHint) {
          forgetCachedPanelDeviceId(cached);
          await allocate();
          return;
        }
        if (!recordSurface) {
          const stamped = await patchPanelDeviceWithStatus(cached, { capabilities: { surface: surfaceHint } });
          if (cancelled) return;
          finish(cached, stamped.ok);
          return;
        }
      }
      // ok || non-404 failure (network, transient 401): trust the cache. A
      // blip shouldn't burn the device record and force a fresh allocate. An
      // unverified id may belong to another PC, so it is not cached for this one.
      finish(cached, result.ok);
    })();
    return () => { cancelled = true; };
  }, [state, inferredSurface, surfaceHint, viewportCapabilities, allocAttempt, t, needsPhoneClaim]);

  const retry = useCallback(() => {
    setFailureDetail('');
    setAllocAttempt(n => n + 1);
    setState('allocating');
  }, []);

  if (state === 'claiming' || state === 'allocating') {
    return <PanelEntrypointGate onRetry={state === 'allocating' ? retry : undefined} />;
  }
  if (state === 'failed') {
    return (
      <PanelEntrypointFailure
        kind={failureKind}
        detail={failureDetail}
        isPhone={inferredSurface === 'phone' || isPhonePair}
        // Reached this failure via a stored paired-PC token (not a fresh
        // claim) - offer a way out other than retrying the same bad token
        // forever: a fresh QR scan re-pairs (and, still being the active
        // record, upgrades this same needsRepair entry rather than
        // duplicating it - see upsertPairedPc).
        showPairAgain={failureKind === 'auth' && !needsPhoneClaim}
        onRetry={retry}
      />
    );
  }
  if (!deviceId) {
    return <div className={styles.panelPairGate}>{t('panel.gate.noDeviceId')}</div>;
  }
  return <PanelWrapper deviceId={deviceId} wired={isWiredPanel(inferredSurface)} />;
}

/** Milliseconds of waiting before the gate explains itself. Long enough that a
 *  healthy boot never flashes the "taking longer" copy. The exits do NOT wait
 *  on this - a connect the user wants out of must be escapable immediately. */
const GATE_SLOW_MS = 4000;

/**
 * The pre-panel waiting screen. Never a bare spinner: this owns the whole
 * viewport before PanelApp mounts and before any in-panel chrome exists, so
 * with nothing on it the user is stuck - which is exactly what an unreachable
 * host produced (a silent ~20s spin inside the native wrapper).
 */
function PanelEntrypointGate({ onRetry }: { onRetry?: () => void }) {
  const { t } = useTranslation();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), GATE_SLOW_MS);
    return () => window.clearTimeout(timer);
  }, []);
  const canFindComputer = hasNativeFindComputerBridge();

  return (
    <div className={styles.panelPairGate}>
      <div className={styles.panelPairGateCard}>
        <Spinner size={28} />
        <h2 className={styles.panelPairGateTitle}>{t('panel.gate.connecting')}</h2>
        {slow && <p className={styles.panelPairGateBody}>{t('panel.gate.slow')}</p>}
        {/* Retry ISSUES work, so it waits out the slow window: a tap while the
            first allocate is still in flight leaves that one to complete
            server-side and orphan its device record. The escape below issues
            nothing and is live immediately - that is the one the user needs.
            Retry also re-runs the allocate step only; during the QR claim it
            would abandon an in-flight claim whose effect cannot be cancelled
            (its deps never change), and the stale promise would then setState
            over an already-mounted panel. */}
        {slow && onRetry && (
          <button type="button" className={styles.panelPairGateRetry} onClick={onRetry}>
            {t('panel.gate.retry')}
          </button>
        )}
        {canFindComputer && (
          <button
            type="button"
            className={`${styles.panelPairGateRetry} ${styles.panelPairGateSecondary}`}
            onClick={openFindComputer}
          >
            {t('panel.gate.findComputer')}
          </button>
        )}
      </div>
    </div>
  );
}

function PanelEntrypointFailure({ kind, detail, isPhone, showPairAgain, onRetry }: {
  kind: PanelFailureKind;
  detail: string;
  isPhone: boolean;
  showPairAgain: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  let headline = t('panel.gate.fail.registerHeadline');
  let body = '';
  if (kind === 'auth') {
    headline = isPhone ? t('panel.gate.fail.pairPhoneHeadline') : t('panel.gate.fail.authHeadline');
    body = isPhone
      ? t('panel.gate.fail.pairPhoneBody')
      : t('panel.gate.fail.authBody');
  } else if (kind === 'pair-expired') {
    headline = t('panel.gate.fail.expiredHeadline');
    body = t('panel.gate.fail.expiredBody');
  } else {
    headline = t('panel.gate.fail.serviceHeadline');
    body = t('panel.gate.fail.serviceBody');
  }

  // Inside the native app this gate is otherwise a dead end - the panel never
  // mounted, so there is no in-panel chrome to leave it. Offer a route back to
  // the wrapper's "Find your computer" page (keeps the pairing). A plain
  // browser has no such surface, so the affordance is hidden there.
  const canFindComputer = hasNativeFindComputerBridge();

  return (
    <div className={styles.panelPairGate}>
      <div className={styles.panelPairGateCard}>
        <h2 className={styles.panelPairGateTitle}>{headline}</h2>
        <p className={styles.panelPairGateBody}>{body}</p>
        {detail && <p className={styles.panelPairGateDetail}>{detail}</p>}
        <button type="button" className={styles.panelPairGateRetry} onClick={onRetry}>
          {t('panel.gate.retry')}
        </button>
        {showPairAgain && canFindComputer && (
          <button
            type="button"
            className={`${styles.panelPairGateRetry} ${styles.panelPairGateSecondary}`}
            onClick={openFindComputer}
          >
            {t('connection.sessionRevoked.pairAgain')}
          </button>
        )}
        {canFindComputer && (
          <button
            type="button"
            className={`${styles.panelPairGateRetry} ${styles.panelPairGateSecondary}`}
            onClick={openFindComputer}
          >
            {t('panel.gate.findComputer')}
          </button>
        )}
      </div>
    </div>
  );
}
