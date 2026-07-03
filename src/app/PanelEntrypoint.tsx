import { useCallback, useEffect, useMemo, useState } from 'react';
import PanelApp from '../panel/PanelApp';
import { Spinner } from '../components/common/Spinner/Spinner';
import { PanelSimulatorContent } from '../panel/embed/PanelSimulatorContent';
import OverlayShell from '../overlay/OverlayShell';
import { inferSurfaceFromViewport } from '../panel/device/inferSurface';
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
import { useTranslation } from '../lib/i18n';
import { useMonitoringStoreBridge } from './monitoringBridge';
import { PANEL_DEVICE_ID_KEY, PHONE_PANEL_PWA_KEY } from './panelRouting';
import styles from '../App.module.scss';

type PanelFailureKind = 'auth' | 'network' | 'pair-expired';
type PanelEntrypointState = 'claiming' | 'allocating' | 'ready' | 'failed';

export function PanelWrapper({ deviceId, wired = false }: { deviceId: string; wired?: boolean }) {
  const multiplex = useMultiplexConnection(true, wired);
  useMonitoringStoreBridge(multiplex);
  return (
    <MultiplexContext.Provider value={multiplex}>
      <UiSettingsProvider serviceOnline={true} manageDom={false}>
        <PanelApp deviceId={deviceId} />
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

export function OverlayWrapper() {
  const multiplex = useMultiplexConnection(true);
  useMonitoringStoreBridge(multiplex);
  return (
    <MultiplexContext.Provider value={multiplex}>
      <UiSettingsProvider serviceOnline={true} manageDom={false}>
        <OverlayShell />
      </UiSettingsProvider>
    </MultiplexContext.Provider>
  );
}

export function PanelEntrypoint({ initialDeviceId, isPhonePair, pairToken, pairDeviceId, pairSpki }: {
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
  const inferredSurface = useMemo(() => inferSurfaceFromViewport(isPhonePair), [isPhonePair]);
  // Snapshot the kiosk's own viewport so the service can pass it on to the
  // dashboard simulator iframe (which otherwise renders against a hardcoded
  // profile that doesn't reflect the user's actual Y70 model + Windows DPI).
  const viewportCapabilities = useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    const dpr = Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0
      ? window.devicePixelRatio
      : 1;
    return {
      surface: inferredSurface,
      cssWidth: Math.max(1, Math.round(window.innerWidth)),
      cssHeight: Math.max(1, Math.round(window.innerHeight)),
      dpr,
    };
  }, [inferredSurface]);

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
    const finish = (id: string) => {
      if (cancelled) return;
      localStorage.setItem(PANEL_DEVICE_ID_KEY, id);
      setDeviceId(id);
      const target = `${window.location.origin}/panel/${encodeURIComponent(id)}`;
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
      const cached = localStorage.getItem(PANEL_DEVICE_ID_KEY);
      if (!cached) {
        await allocate();
        return;
      }
      // Verify the cached device still exists server-side. A 404 means the
      // record was dropped (profile wipe, session revoke that took the device
      // with it, manual delete) and trusting the cache would mount the panel
      // against a dead id - usePanelLayout would then 404 and fall back to a
      // default layout that's empty when /defaults hasn't loaded yet. Use the
      // patch as a touch + verify in one round-trip, carrying current
      // viewport hints when we have them.
      const patch = viewportCapabilities ? { capabilities: viewportCapabilities } : {};
      const result = await patchPanelDeviceWithStatus(cached, patch);
      if (cancelled) return;
      if (!result.ok && result.status === 404) {
        localStorage.removeItem(PANEL_DEVICE_ID_KEY);
        await allocate();
        return;
      }
      // ok || non-404 failure (network, transient 401): trust the cache. A
      // blip shouldn't burn the device record and force a fresh allocate.
      finish(cached);
    })();
    return () => { cancelled = true; };
  }, [state, inferredSurface, viewportCapabilities, allocAttempt, t, needsPhoneClaim]);

  const retry = useCallback(() => {
    setFailureDetail('');
    setAllocAttempt(n => n + 1);
    setState('allocating');
  }, []);

  if (state === 'claiming' || state === 'allocating') {
    return <div className={styles.panelPairGate}><Spinner size={28} /></div>;
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
        {showPairAgain && (
          <a
            className={`${styles.panelPairGateRetry} ${styles.panelPairGateSecondary}`}
            href="/r/pair"
          >
            {t('connection.sessionRevoked.pairAgain')}
          </a>
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
