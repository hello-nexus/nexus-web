import { useEffect, useState } from 'react';
import type { BackgroundMode } from '../lib/settings';
import styles from './AppBackdrop.module.scss';

// Theme-adaptive backdrop behind the whole dashboard. Three modes (set in the
// Theme settings, applied via applyBackgroundMode):
//   - glass:    nothing here — the native shell renders a behind-window frosted
//               material and the web stays transparent so it shows through. In a
//               plain browser there's no native blur, so the flat base shows.
//   - gradient: flowing accent-tinted ribbons (pure vector, color-mix over the
//               live --accent* vars so it tracks the accent + theme).
//   - flat:     nothing here — the solid --backdrop-base on .layout shows.
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
      {mode === 'gradient' && (
        <svg
          className={styles.ribbons}
          focusable="false"
          preserveAspectRatio="xMidYMid slice"
          viewBox="0 0 1600 1000"
        >
          <defs>
            <linearGradient id="nxRibbon1" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1600" y2="0">
              <stop offset="0" style={{ stopColor: 'var(--backdrop-tint-a)' }} />
              <stop offset="1" style={{ stopColor: 'var(--backdrop-tint-c)' }} />
            </linearGradient>
            <linearGradient id="nxRibbon2" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1600" y2="0">
              <stop offset="0" style={{ stopColor: 'var(--backdrop-tint-b)' }} />
              <stop offset="1" style={{ stopColor: 'var(--backdrop-tint-a)' }} />
            </linearGradient>
            <linearGradient id="nxRibbon3" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1600" y2="0">
              <stop offset="0" style={{ stopColor: 'var(--backdrop-tint-c)' }} />
              <stop offset="1" style={{ stopColor: 'var(--backdrop-tint-b)' }} />
            </linearGradient>
            <filter id="nxRibbonBlur" x="-15%" y="-25%" width="130%" height="150%">
              <feGaussianBlur stdDeviation="70" />
            </filter>
          </defs>
          <g filter="url(#nxRibbonBlur)" fill="none" strokeLinecap="round">
            <path d="M-160 300 C 360 150, 760 410, 1760 230" stroke="url(#nxRibbon1)" strokeWidth="300" />
            <path d="M-180 620 C 380 480, 940 800, 1780 560" stroke="url(#nxRibbon2)" strokeWidth="340" />
            <path d="M-200 880 C 480 760, 1020 1030, 1800 820" stroke="url(#nxRibbon3)" strokeWidth="260" />
          </g>
        </svg>
      )}
    </div>
  );
}
