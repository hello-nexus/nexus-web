import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ContextMenuManager } from './components/ContextMenu/ContextMenuManager';
import './styles/variables.scss';
import './styles/global.scss';
import { loadSettings, applyThemeMode, applyAccentColor, watchSystemTheme } from './lib/settings';
import { bootDebugFont } from './lib/debugFont';

// Apply persisted theme mode + accent color before first paint so there's
// no flash of the default violet.
const { general } = loadSettings();
applyThemeMode(general.themeMode);
applyAccentColor(general.accentColor);
watchSystemTheme(general.themeMode);
bootDebugFont();

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
  window.addEventListener('load', () => {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((registration) => {
      registration.update().catch(() => { /* best-effort */ });
    }).catch((err) => {
      console.warn('[qos-web] service worker registration failed:', err);
    });
  });
}
