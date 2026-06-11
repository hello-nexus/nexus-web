import { useEffect, useRef } from 'react';
import { useUiSettings } from '../hooks/useUiSettings';
import { resolveTheme } from '../lib/settings';
import { savePreferences } from '../api/profiles';

// Publishes the desktop app's *resolved* theme ('dark'|'light') to the server
// so remote panels in sync mode follow the desktop OS's light↔dark. The desktop
// stores themeMode='system', a literal each panel would otherwise re-resolve
// against its OWN device's OS (the wrong OS). Parallels SystemAccentSync, which
// pushes a concrete accent value for the same reason. Desktop-only (mounted in
// Dashboard); the panel re-fetches off the prefs topic this write broadcasts.
export function ResolvedThemeSync() {
  const { settings } = useUiSettings();
  const mode = settings.themeMode;
  const lastPublished = useRef<string | null>(null);

  useEffect(() => {
    const publish = () => {
      const resolved = resolveTheme(mode);
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
