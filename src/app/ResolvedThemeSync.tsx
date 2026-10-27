import { useEffect } from 'react';
import { useUiSettings } from '../hooks/useUiSettings';
import { resolveTheme } from '../lib/settings';
import { postResolvedTheme } from './windowActions';

// Tells the native host the in-app *resolved* theme ('dark'|'light') so its
// native chrome - Windows DWM immersive mode + Mica, macOS window appearance +
// vibrancy - follows the in-app theme instead of the OS theme. Never writes
// preferences: theme.resolvedThemeMode is the host OS theme, owned by the
// service. Parallels SystemAccentSync. Desktop-only (mounted in Dashboard).
export function ResolvedThemeSync() {
  const { settings } = useUiSettings();
  const mode = settings.themeMode;
  const hostMode = settings.hostThemeMode;

  useEffect(() => {
    const publish = () => postResolvedTheme(resolveTheme(mode, hostMode) === 'dark');
    publish();
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener('change', publish);
    return () => mq.removeEventListener('change', publish);
  }, [mode, hostMode]);

  return null;
}
