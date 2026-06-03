import { useEffect, useState } from 'react';
import { I18nProvider } from '../lib/i18n';
import { Dashboard } from './Dashboard';
import { SplashPage } from './SplashPage';
import { detectLocalService } from '../api/service';
import { INSTALLED_KEY } from '../hooks/useServiceStatus';

/**
 * Public entry point for hellonexus.com.
 *
 * Detects whether THIS machine is running Nexus. If it is (or ever has been —
 * remembered in localStorage under INSTALLED_KEY), the visitor is an existing
 * user and goes straight to the dashboard, which drives the local service over
 * localhost (App.tsx set forceLanMode for this branch). Otherwise they get the
 * coming-soon splash — later this slot becomes the onboarding flow. Clearing
 * site data resets a visitor to the splash, by design.
 *
 * Only the never-detected case shows the splash; a remembered user whose service
 * is momentarily down still lands on the dashboard and sees its own reconnect
 * UI, not the marketing page.
 */
export function PublicGate() {
  const [phase, setPhase] = useState<'checking' | 'app' | 'splash'>(() =>
    remembered() ? 'app' : 'checking',
  );

  useEffect(() => {
    if (phase !== 'checking') return;
    let cancelled = false;
    void detectLocalService().then((found) => {
      if (cancelled) return;
      if (found) {
        rememberInstall();
        setPhase('app');
      } else {
        setPhase('splash');
      }
    });
    return () => { cancelled = true; };
  }, [phase]);

  if (phase === 'splash') return <SplashPage />;
  // Brief neutral frame while the (sub-second) probe runs — avoids a splash
  // flash before a detected desktop resolves to the dashboard.
  if (phase === 'checking') return <div style={{ minHeight: '100dvh', background: 'var(--bg)' }} />;
  return (
    <I18nProvider>
      <Dashboard />
    </I18nProvider>
  );
}

function remembered(): boolean {
  try {
    return localStorage.getItem(INSTALLED_KEY) === 'true';
  } catch {
    return false;
  }
}

function rememberInstall(): void {
  try {
    localStorage.setItem(INSTALLED_KEY, 'true');
  } catch {
    /* storage unavailable (private mode) — detection just re-runs next visit */
  }
}
