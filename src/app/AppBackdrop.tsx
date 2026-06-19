import { useEffect, useState } from 'react';
import type { BackgroundMode } from '../lib/settings';
import styles from './AppBackdrop.module.scss';

// Theme-adaptive backdrop behind the whole dashboard. Three modes (set in the
// Theme settings, applied via applyBackgroundMode):
//   - glass:    nothing here - the native shell renders a behind-window frosted
//               material and the web stays transparent so it shows through. In a
//               plain browser there's no native blur, so the flat base shows.
//   - gradient: a soft accent-tinted mesh gradient (CSS radial blobs + a faint
//               grain) over --backdrop-base, tracking the live --accent* vars.
//   - flat:     nothing here - the solid --backdrop-base on .layout shows.
// The mode is mirrored to <html data-bg> (for the flat base color) and pushed on
// a window event so this component swaps the rendered layer with no prop drilling.

function currentMode(): BackgroundMode {
  const v = document.documentElement.getAttribute('data-bg');
  return v === 'gradient' || v === 'flat' ? v : 'glass';
}

export function AppBackdrop() {
  const [mode, setMode] = useState<BackgroundMode>(currentMode);

  useEffect(() => {
    const onMode = (e: Event) => setMode((e as CustomEvent).detail as BackgroundMode);
    window.addEventListener('nexus:bg-mode', onMode);
    return () => window.removeEventListener('nexus:bg-mode', onMode);
  }, []);

  return (
    <div className={styles.backdrop} aria-hidden="true">
      {mode === 'gradient' && <div className={styles.gradient} />}
    </div>
  );
}
