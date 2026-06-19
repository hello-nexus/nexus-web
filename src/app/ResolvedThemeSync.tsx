import { useEffect, useRef } from 'react';
import { useUiSettings } from '../hooks/useUiSettings';
import { resolveTheme } from '../lib/settings';
import { savePreferences } from '../api/profiles';
import { postResolvedTheme } from './windowActions';

// Publishes the desktop app's *resolved* theme ('dark'|'light') to two places:
//  - the native host (postResolvedTheme), so its native chrome - Windows DWM
//    immersive mode + Mica, macOS window appearance + vibrancy - follows the
//    in-app theme instead of the OS theme.
//  - the server (savePreferences), so remote panels in sync mode follow the
//    desktop's light↔dark (the desktop stores themeMode='system', which each
//    panel would otherwise re-resolve against its OWN device's OS).
// Parallels SystemAccentSync. Desktop-only (mounted in Dashboard).
export function ResolvedThemeSync() {
  const { settings } = useUiSettings();
  const mode = settings.themeMode;
  const lastPublished = useRef<string | null>(null);

  useEffect(() => {
    const publish = () => {
      const resolved = resolveTheme(mode);
      // Always tell the native host (cheap; it dedupes), even when the server
      // write below is skipped as unchanged.
      postResolvedTheme(resolved === 'dark');
      if (resolved === lastPublished.current) return;
      lastPublished.current = resolved;
      savePreferences({ theme: { resolvedThemeMode: resolved } }).catch(() => {});
    };
    publish();
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener('change', publish);
    return () => mq.removeEventListener('change', publish);
  }, [mode]);

  return null;
}
