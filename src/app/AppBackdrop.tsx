import { useEffect, useRef, useState } from 'react';
import { getToken } from '../api/auth';
import { resolveHttp } from '../api/service';
import { requestWindowOrigin, subscribeWindowOrigin, subscribeWallpaperChanged, isMacAppShell } from './windowActions';
import type { BackgroundMode } from '../lib/settings';
import styles from './AppBackdrop.module.scss';

// Theme-adaptive backdrop behind the whole dashboard. Three modes (set in the
// Theme settings, applied via applyBackgroundMode):
//   - wallpaper: the OS desktop wallpaper, screen-anchored + blurred + veiled,
//                faking a Mica/Acrylic frosted-glass pane over the real desktop.
//   - gradient:  flowing accent-tinted ribbons (pure vector, color-mix over the
//                live --accent* vars so it tracks the accent + theme).
//   - flat:      nothing here — the solid --backdrop-base on .layout shows.
// The mode is mirrored to <html data-bg> (for the flat base color) and pushed on
// a window event so this component swaps the rendered layer with no prop drilling.

function currentMode(): BackgroundMode {
  const v = document.documentElement.getAttribute('data-bg');
  return v === 'gradient' || v === 'flat' ? v : 'wallpaper';
}

export function AppBackdrop() {
  // On the macOS shell, "wallpaper" mode is served by a native behind-window
  // NSVisualEffectView (real frosted desktop, zero lag), so the web renders no
  // texture here and the transparent WKWebView reveals it. See MacAppWindow.cs.
  const nativeWallpaper = isMacAppShell();
  const [mode, setMode] = useState<BackgroundMode>(currentMode);
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const wpRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMode = (e: Event) => setMode((e as CustomEvent).detail as BackgroundMode);
    window.addEventListener('nexus:bg-mode', onMode);
    return () => window.removeEventListener('nexus:bg-mode', onMode);
  }, []);

  // Re-fetch when the OS wallpaper changes — debounced, because a single change
  // fires a burst of registry writes (and the rendered file is briefly mid-write).
  // Coalescing into one settled re-fetch avoids re-reading a stale/half-written
  // image and the repeated swaps that caused the flicker.
  useEffect(() => {
    if (mode !== 'wallpaper' || nativeWallpaper) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeWallpaperChanged(() => {
      clearTimeout(timer);
      timer = setTimeout(() => setReloadNonce(n => n + 1), 500);
    });
    return () => { clearTimeout(timer); unsubscribe(); };
  }, [mode, nativeWallpaper]);

  // Fetch the wallpaper (session bearer, same-origin) and downscale it to a tiny
  // texture. Upscaling that tiny texture to full screen IS the frosted blur —
  // far cheaper than filter: blur() on a full-res image, and (anchored by a
  // transform) it costs ~nothing per window move. no-store so a re-fetch after a
  // wallpaper change bypasses the HTTP cache. 404 → base shows.
  useEffect(() => {
    if (mode !== 'wallpaper' || nativeWallpaper) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const init: RequestInit = { cache: 'no-store' };
        if (token) init.headers = { Authorization: `Bearer ${token}` };
        const res = await fetch(resolveHttp('/system/wallpaper'), init);
        if (!res.ok || cancelled) return;
        const bitmap = await createImageBitmap(await res.blob());
        if (cancelled) { bitmap.close(); return; }
        // Downscale to a very small texture: upscaling it back to full screen is
        // a huge, unrecognizable blur. PNG keeps it lossless (no JPEG mush).
        const w = 16;
        const h = Math.max(1, Math.round((w * bitmap.height) / bitmap.width));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')?.drawImage(bitmap, 0, 0, w, h);
        bitmap.close();
        if (cancelled) return;
        const dataUrl = canvas.toDataURL('image/png');
        // Swap only if it actually changed — the same wallpaper yields an
        // identical PNG, so React skips the render (no flicker). Never clear
        // here: the current image stays until the new one is ready (seamless).
        setWallpaperUrl(prev => (prev === dataUrl ? prev : dataUrl));
      } catch {
        /* leave base showing */
      }
    })();
    return () => { cancelled = true; };
  }, [mode, reloadNonce, nativeWallpaper]);

  // Anchor the wallpaper to the desktop, not the window: size the tiny-texture
  // layer to the monitor and translate it by the window's on-screen position so
  // the visible slice matches the real desktop behind the window (faked Mica).
  // translate3d is compositor-only, so each move is a cheap GPU translate of a
  // cached texture — no re-blur, no re-paint. Driven by the native host's
  // per-move origin push (event-driven); in a plain browser there's no host, so
  // the layer just stays put (the vars keep their CSS defaults).
  useEffect(() => {
    if (mode !== 'wallpaper' || !wallpaperUrl) return;
    const apply = (o: { x: number; y: number; w: number; h: number }) => {
      const el = wpRef.current;
      if (!el) return;
      el.style.setProperty('--wp-x', `${-o.x}px`);
      el.style.setProperty('--wp-y', `${-o.y}px`);
      el.style.setProperty('--wp-w', `${o.w}px`);
      el.style.setProperty('--wp-h', `${o.h}px`);
    };
    const unsubscribe = subscribeWindowOrigin(apply);
    requestWindowOrigin();
    return unsubscribe;
  }, [mode, wallpaperUrl]);

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
      {mode === 'wallpaper' && wallpaperUrl && (
        <>
          <div ref={wpRef} className={styles.wallpaper} style={{ backgroundImage: `url(${wallpaperUrl})` }} />
          <div className={styles.wallpaperVeil} />
        </>
      )}
    </div>
  );
}
