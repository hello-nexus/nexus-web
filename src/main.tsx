// Polyfills MUST load before any other import — they patch globals that the
// rest of the bundle's transitive imports may call at module-init time.
import './lib/polyfills';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ContextMenuManager } from './components/ContextMenu/ContextMenuManager';
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
  // Attach controllerchange exactly once. The previous shape registered it
  // inside the `load` callback, so an HMR re-eval (or any second module-init
  // path) would stack a second listener and reload twice on every SW update.
  // `{ once: true }` auto-removes after firing, so no manual `refreshing` guard
  // is needed.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  }, { once: true });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((registration) => {
      registration.update().catch(() => { /* best-effort */ });
    }).catch((err) => {
      console.warn('[qos-web] service worker registration failed:', err);
    });
  }, { once: true });
}
