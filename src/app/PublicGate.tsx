import { useEffect, useState } from 'react';
import { I18nProvider } from '../lib/i18n';
import { Dashboard } from './Dashboard';
import { SplashPage } from './SplashPage';
import { detectLocalService } from '../api/service';

/**
 * Public entry point for hellonexus.com.
 *
 * Probes (with a hard timeout) whether THIS machine runs Nexus. Detected → the
 * visitor is an existing user → render the dashboard, which drives the local
 * service over localhost (App.tsx set forceLanMode for this branch). Not
 * detected → the coming-soon splash (later: onboarding).
 *
 * Spin-proof by construction: detectLocalService() is bounded, so 'checking'
 * always resolves (to app or splash) within the timeout — it can never hang the
 * way the earlier remembered-fast-path did (it rendered the dashboard before any
 * bounded probe, and a PNA-stalled localhost ping then spun forever).
 */
export function PublicGate() {
  const [phase, setPhase] = useState<'checking' | 'app' | 'splash'>('checking');

  useEffect(() => {
    let cancelled = false;
    void detectLocalService().then((found) => {
      if (!cancelled) setPhase(found ? 'app' : 'splash');
    });
    return () => { cancelled = true; };
  }, []);

  // Brief neutral frame while the (sub-second) probe runs — avoids a splash
  // flash before a detected desktop resolves to the dashboard.
  if (phase === 'checking') return <div style={{ minHeight: '100dvh', background: 'var(--bg)' }} />;
  if (phase === 'splash') return <SplashPage />;
  return (
    <I18nProvider>
      <Dashboard />
    </I18nProvider>
  );
}
