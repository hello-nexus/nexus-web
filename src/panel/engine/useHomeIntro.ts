import { useEffect, useState } from 'react';

const HOME_INTRO_MS = 1200;
// Module-level so the once-per-launch gate survives the DashboardView remount
// that navigating away from and back to home triggers.
let played = false;

export function useHomeIntro(enabled: boolean): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!enabled || played) return;
    played = true;
    setActive(true);
    const timer = window.setTimeout(() => setActive(false), HOME_INTRO_MS);
    return () => window.clearTimeout(timer);
  }, [enabled]);
  return active;
}
