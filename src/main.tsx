// Polyfills MUST load before any other import - they patch globals that the
// rest of the bundle's transitive imports may call at module-init time.
import './lib/polyfills';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ContextMenuManager } from './components/common/ContextMenu/ContextMenuManager';
import './styles/variables.scss';
import './styles/global.scss';
import { loadSettings, applyThemeMode, applyAccentColor, applyBackgroundMode, watchSystemTheme } from './lib/settings';
import { bootDebugFont } from './lib/debugFont';
import { preloadInstallDefaults } from './api/installDefaultsCache';
import { isRemoteOrigin } from './api/service';
import { initMemoryProbe } from './diag/memoryProbe';
import { initBuildReloadWatcher } from './lib/buildReloadWatcher';
import { initHoverGuard } from './lib/hoverGuard';

// Apply persisted theme mode + accent color before first paint so there's
// no flash of the default violet.
const { general } = loadSettings();
applyThemeMode(general.themeMode);
applyAccentColor(general.accentColor);
applyBackgroundMode(general.backgroundMode);
watchSystemTheme(general.themeMode);
bootDebugFont();
initHoverGuard();

// Kick off the install-defaults fetch in parallel with React mount; the
// `defaultLayout*` helpers read from this cache instead of hardcoding the
// panel surface layouts. Not awaited - the network round-trip resolves
// faster than the first hook that needs it.
void preloadInstallDefaults();

// Local WebView2 surfaces (dashboard / overlay / Y70 panel) report renderer
// memory + health to the service log so a field memory leak leaves a trace.
// Skipped on remote origins (phones, public website) - the leaking surface is
// always a local renderer and the endpoint is loopback-only.
if (!isRemoteOrigin) initMemoryProbe();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ContextMenuManager />
    <App />
  </StrictMode>
);

// Refresh long-lived clients (kiosk panels, dashboard) onto a newly deployed
// web bundle. Only calls location.reload(); never touches adb/USB/the tunnel.
initBuildReloadWatcher();

// Register the offline service worker. Only runs on HTTPS or localhost contexts
// (browsers refuse SW registration on plain HTTP for non-loopback origins).
if (
  'serviceWorker' in navigator &&
  (location.protocol === 'https:' ||
    location.hostname === 'localhost' ||
    location.hostname.endsWith('.localhost'))
) {
  // Per-tab flag (auto-cleared when the tab closes) recording that we've already
  // done the post-update reload once in this tab.
  const SW_RELOADED_KEY = 'nexus_sw_reloaded';
  const readReloaded = () => {
    try { return sessionStorage.getItem(SW_RELOADED_KEY) === '1'; } catch { return false; }
  };

  // Reload to pick up a new SW build ONLY on a real update - i.e. when a
  // controller ALREADY exists and is later replaced. On a first visit there is
  // no controller yet, and the SW's initial activation also fires
  // controllerchange; reloading then restarts the page mid-session (e.g. during
  // QR pairing), which churns the relay connection and intermittently breaks
  // pairing. Gating on an existing controller skips that first-visit reload.
  //
  // Bounded to ONCE per tab. `{ once: true }` only stops a re-fire within a
  // single page load; the listener is re-armed on every load. Safari/WebKit can
  // fire controllerchange on essentially every load (it intermittently treats a
  // byte-identical sw.js as updated and re-activates it), so without a guard
  // that survives the reload the page reloads forever - the loop reported on
  // Safari mac/iOS. The sessionStorage flag persists across reloads within the
  // tab, so the second controllerchange is a no-op and the loop can't form. The
  // SW no longer self-activates mid-session (see sw.js), so in practice this now
  // rarely fires at all; it stays as a hard cap.
  if (navigator.serviceWorker.controller && !readReloaded()) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      try { sessionStorage.setItem(SW_RELOADED_KEY, '1'); } catch { /* storage blocked */ }
      window.location.reload();
    }, { once: true });
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((registration) => {
      registration.update().catch(() => { /* best-effort */ });
    }).catch((err) => {
      console.warn('[nexus-web] service worker registration failed:', err);
    });
  }, { once: true });
}
