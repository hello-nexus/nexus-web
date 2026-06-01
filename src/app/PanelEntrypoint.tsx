import { useCallback, useEffect, useMemo, useState } from 'react';
import PanelApp from '../panel/PanelApp';
import { PanelSimulatorContent } from '../panel/embed/PanelSimulatorContent';
import OverlayShell from '../overlay/OverlayShell';
import { inferSurfaceFromViewport } from '../panel/inferSurface';
import {
  allocatePanelDeviceWithStatus,
  patchPanelDeviceWithStatus,
  claimPanelPhonePairing,
} from '../api/panel';
import { storePhoneToken } from '../api/auth';
import { getDeviceId } from '../api/deviceId';
import { MultiplexContext, useMultiplexConnection } from '../hooks/useMultiplexSocket';
import { UiSettingsProvider } from '../hooks/useUiSettings';
import { useMonitoringStoreBridge } from './monitoringBridge';
import { PANEL_DEVICE_ID_KEY, PHONE_PANEL_PWA_KEY } from './panelRouting';
import styles from '../App.module.scss';

type PanelFailureKind = 'auth' | 'network' | 'pair-expired';
type PanelEntrypointState = 'claiming' | 'allocating' | 'ready' | 'failed';

export function PanelWrapper({ deviceId }: { deviceId: string }) {
  const multiplex = useMultiplexConnection(true);
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

export function PanelEntrypoint({ initialDeviceId, isPhonePair, pairToken, pairDeviceId }: {
  initialDeviceId: string | null;
  isPhonePair: boolean;
  pairToken: string | null;
  // Stable per-device id carried on the LAN-direct redirect (?deviceId=) by the
  // remote-origin PairRedirect, so this same-origin claim dedups to the SAME
  // authorized-device session the relay path would have used. Absent on a fresh
  // local-origin scan — fall back to this origin's own stable id.
  pairDeviceId: string | null;
}) {
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
  }, [needsPhoneClaim, pairToken, pairDeviceId]);

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
      setFailureKind(kind);
      setFailureDetail(result.status ? `HTTP ${result.status}` : 'Network error');
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
  }, [state, inferredSurface, viewportCapabilities, allocAttempt]);

  const retry = useCallback(() => {
    setFailureDetail('');
    setAllocAttempt(n => n + 1);
    setState('allocating');
  }, []);

  if (state === 'claiming') {
    return <div className={styles.panelPairGate}>Pairing phone...</div>;
  }
  if (state === 'allocating') {
    return <div className={styles.panelPairGate}>Registering panel...</div>;
  }
  if (state === 'failed') {
    return (
      <PanelEntrypointFailure
        kind={failureKind}
        detail={failureDetail}
        isPhone={inferredSurface === 'phone' || isPhonePair}
        onRetry={retry}
      />
    );
  }
  if (!deviceId) {
    return <div className={styles.panelPairGate}>No device id</div>;
  }
  return <PanelWrapper deviceId={deviceId} />;
}

function PanelEntrypointFailure({ kind, detail, isPhone, onRetry }: {
  kind: PanelFailureKind;
  detail: string;
  isPhone: boolean;
  onRetry: () => void;
}) {
  let headline = 'Could not register this panel';
  let body = '';
  if (kind === 'auth') {
    headline = isPhone ? 'Pair this phone first' : 'This panel needs to be authorized';
    body = isPhone
      ? 'On your PC, open the Nexus dashboard, tap "Pair Phone" in the sidebar, and scan the QR code with this phone. Then tap Retry below.'
      : 'Open this URL with a service token (?token=...), or load it from the local machine where nexus-service is running.';
  } else if (kind === 'pair-expired') {
    headline = 'Pairing expired';
    body = 'Generate a new QR from the Nexus dashboard ("Pair Phone") and scan it again.';
  } else {
    headline = 'Could not reach the service';
    body = 'Check that nexus-service is running, then retry.';
  }

  return (
    <div className={styles.panelPairGate}>
      <div className={styles.panelPairGateCard}>
        <h2 className={styles.panelPairGateTitle}>{headline}</h2>
        <p className={styles.panelPairGateBody}>{body}</p>
        {detail && <p className={styles.panelPairGateDetail}>{detail}</p>}
        <button type="button" className={styles.panelPairGateRetry} onClick={onRetry}>
          Retry
        </button>
      </div>
    </div>
  );
}
