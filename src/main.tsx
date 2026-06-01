// Polyfills MUST load before any other import — they patch globals that the
// rest of the bundle's transitive imports may call at module-init time.
import './lib/polyfills';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ContextMenuManager } from './components/common/ContextMenu/ContextMenuManager';
import './styles/variables.scss';
import './styles/global.scss';
import { loadSettings, applyThemeMode, applyAccentColor, watchSystemTheme } from './lib/settings';
import { bootDebugFont } from './lib/debugFont';
import { preloadInstallDefaults } from './api/installDefaultsCache';

// Apply persisted theme mode + accent color before first paint so there's
// no flash of the default violet.
const { general } = loadSettings();
applyThemeMode(general.themeMode);
applyAccentColor(general.accentColor);
watchSystemTheme(general.themeMode);
bootDebugFont();

// Kick off the install-defaults fetch in parallel with React mount; the
// `defaultLayout*` helpers read from this cache instead of hardcoding the
// panel surface layouts. Not awaited — the network round-trip resolves
// faster than the first hook that needs it.
void preloadInstallDefaults();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ContextMenuManager />
    <App />
  </StrictMode>
);

// Register the offline service worker. Only runs on HTTPS or localhost contexts
// (browsers refuse SW registration on plain HTTP for non-loopback origins).
if (
  'serviceWorker' in navigator &&
  (location.protocol === 'https:' ||
    location.hostname === 'localhost' ||
    location.hostname.endsWith('.localhost'))
) {
  // Reload to pick up a new SW build ONLY on a real update — i.e. when a
  // controller ALREADY exists and is later replaced. On a first visit there is
  // no controller yet, and the SW's initial activation also fires
  // controllerchange; reloading then restarts the page mid-session (e.g. during
  // QR pairing), which churns the relay connection and intermittently breaks
  // pairing. Gating on an existing controller skips that first-visit reload.
  // `{ once: true }` auto-removes after firing, so no manual `refreshing` guard
  // is needed.
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
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
