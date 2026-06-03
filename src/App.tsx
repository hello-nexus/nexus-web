import { PairRedirect } from './PairRedirect';
import { WidgetReferenceWrapper } from './widgets/reference/WidgetReference';
import { SnapshotHarness } from './__snapshots__/legacy-weather/SnapshotHarness';
import { I18nProvider } from './lib/i18n';
import { SIMULATOR_QUERY_FLAG } from './panel/embed/simulatorProtocol';
import {
  OverlayWrapper,
  PanelEntrypoint,
  PanelSimulatorWrapper,
} from './app/PanelEntrypoint';
import { RESERVED_PANEL_PATH_SEGMENTS, shouldForcePhonePanelRoute } from './app/panelRouting';
import { Dashboard } from './app/Dashboard';
import { isRemoteOrigin, setForceLanMode } from './api/service';
import { isWindowsAppShell, isMacAppShell } from './app/windowActions';

// The public web at hellonexus.com: an ordinary browser origin that is NOT the
// bundled local service (:9400/:9443 ⇒ isServedFromService ⇒ the real app), NOT
// a desktop `--app` shell, and NOT the Vite dev server (import.meta.env.DEV). On
// this origin we let the Dashboard drive the local service over localhost
// (forceLanMode); the Dashboard itself gates its render — blank while
// connecting, the splash if no local Nexus is reachable, the real UI once
// online — so the page never flashes pre-connection chrome.
function isPublicWebsite(): boolean {
  return isRemoteOrigin
    && import.meta.env.PROD
    && !isWindowsAppShell()
    && !isMacAppShell();
}

// Pulls a service token out of `?token=...` into localStorage, then strips
// it from the visible URL. Used by both the panel and overlay entrypoints
// so a Universal Link / kiosk URL can carry auth without parking a secret
// in the address bar.
function consumeUrlToken(params: URLSearchParams) {
  const urlToken = params.get('token');
  if (!urlToken) return;
  localStorage.setItem('nexus_token', urlToken);
  params.delete('token');
  const query = params.toString();
  window.history.replaceState(
    null,
    '',
    `${window.location.origin}${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
  );
}

export default function App() {
  if (shouldForcePhonePanelRoute()) {
    // Standalone PWA was launched outside /panel - redirect into the panel
    // shell. The cached deviceId (if any) will move the user straight to
    // /panel/<id>; otherwise the alloc flow runs and lands them on a fresh
    // device record.
    window.history.replaceState(null, '', `${window.location.origin}/panel`);
  }

  const path = window.location.pathname;

  // /r/pair is the Universal Link target on hellonexus.com. iOS opens the
  // Nexus app directly when installed; otherwise this landing page
  // offers App Store + LAN-redirect fallbacks.
  if (path === '/r/pair') {
    return <PairRedirect />;
  }

  // Declarative widget UI reference: catalog of every meter type plus the
  // binding cheatsheet (available tags / props / variants).
  if (path === '/widget-reference') {
    return (
      <I18nProvider>
        <WidgetReferenceWrapper />
      </I18nProvider>
    );
  }

  // Widget visual-parity harness: legacy + declarative versions side-by-side
  // with identical mocked data; Playwright takes pixel screenshots.
  if (path === '/snapshot-harness') {
    return (
      <I18nProvider>
        <SnapshotHarness />
      </I18nProvider>
    );
  }

  // /overlay is hosted by nexus-overlay.exe (transparent layered window
  // per monitor). Loads with ?monitor=N&token=... so each overlay renders
  // its own slice of the shared overlayLayout.
  if (path === '/overlay') {
    consumeUrlToken(new URLSearchParams(window.location.search));
    return (
      <I18nProvider>
        <OverlayWrapper />
      </I18nProvider>
    );
  }

  // Panel routes:
  //   /panel/<deviceId>  - canonical, opens the panel for that device record.
  //   /panel             - allocate (or recover from cache), then redirect.
  //   /panel/phone[?pair=]   - phone pair flow; allocates a record on success.
  //   /panel/q60         - legacy: maps to a fresh allocation tagged surface=q60.
  //   /touch             - legacy alias for /panel.
  const isPanelPath = path === '/panel'
    || path === '/touch'
    || path.startsWith('/panel/');
  if (isPanelPath) {
    const params = new URLSearchParams(window.location.search);
    consumeUrlToken(params);
    // Simulator iframe entrypoint: PanelDeviceModal loads /panel?simulator=1
    // and feeds layout + theme over postMessage. Skip the device-allocation
    // pairing flow entirely - the simulator has no deviceId.
    if (params.get(SIMULATOR_QUERY_FLAG) === '1') {
      return (
        <I18nProvider>
          <PanelSimulatorWrapper />
        </I18nProvider>
      );
    }
    const segments = path.split('/').filter(Boolean);
    const second = segments[1];
    const isPhonePair = second === 'phone';
    const explicitDeviceId = second && !RESERVED_PANEL_PATH_SEGMENTS.has(second) ? second : null;
    return (
      <I18nProvider>
        <PanelEntrypoint
          initialDeviceId={explicitDeviceId}
          isPhonePair={isPhonePair}
          pairToken={params.get('pair')}
          pairDeviceId={params.get('deviceId')}
        />
      </I18nProvider>
    );
  }

  // Public web entry. Sits AFTER every pairing / panel / overlay / reference
  // route above, so those (and the installed app on localhost) are untouched.
  // On hellonexus.com a local Nexus drives the dashboard over localhost
  // (forceLanMode), so the desktop case behaves like the bundled app.
  //
  // INVARIANT: the /panel|/touch|/r/pair returns above MUST stay ordered before
  // this branch. forceLanMode is a process-global; a phone that reached here
  // would flip to localhost and never use the relay, breaking phone pairing.
  // The phone panel returns earlier, so it never sets it.
  if (isPublicWebsite()) {
    setForceLanMode(true);
  }

  return (
    <I18nProvider>
      <Dashboard />
    </I18nProvider>
  );
}
