import { useEffect, useState } from 'react';

// Bumping the version invalidates older "dismissed" state, e.g. after the app
// ships to the App Store and we want to re-pitch users who dismissed during dev.
const DISMISS_KEY = 'nexus_open_in_app_banner_dismissed_v1';

/**
 * Top banner shown on nexusqos.com when the visitor is on an iPhone/iPad.
 * Tapping "Open" navigates to the `nexusqos://` custom scheme, which iOS
 * hands off to the Nexus app when installed. If the app is not installed,
 * Safari silently does nothing (no error toast); the banner stays put so
 * the user can dismiss or ignore it.
 *
 * Self-gates so it never renders inside the iOS app's WKWebView (the app
 * loads `https://<lan-ip>:9443/panel/phone`, not nexusqos.com), on /r/*
 * routes (PairRedirect owns that flow), or on /panel/phone (that path IS
 * the app's home, no reason to re-pitch).
 */
export function OpenInAppBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(DISMISS_KEY) === '1') return;

    const host = window.location.hostname;
    const isProdHost = host === 'nexusqos.com' || host === 'www.nexusqos.com';
    if (!isProdHost) return;

    const path = window.location.pathname;
    const onAppPath = path.startsWith('/r/')
      || path === '/panel/phone'
      || path.startsWith('/panel/phone/')
      || path === '/overlay';
    if (onAppPath) return;

    const ua = window.navigator.userAgent;
    const isIOSDevice = /iPhone|iPad|iPod/.test(ua)
      // iPadOS 13+ identifies as Mac in UA; cross-check touch capability.
      || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
    if (!isIOSDevice) return;

    // Standalone PWA already lives outside the browser - the banner would
    // be redundant chrome.
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    if (standalone) return;

    // Banner gating depends on host / UA / standalone / localStorage — all of
    // which read window globals, so the visibility decision can only be made
    // post-mount. setState in effect is the right primitive for this.
     
    setVisible(true);
  }, []);

  if (!visible) return null;

  const openInApp = () => {
    window.location.href = 'nexusqos://open';
  };

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
  };

  return (
    <div style={banner} role="region" aria-label="Nexus app for iPhone">
      <button type="button" style={dismissBtn} onClick={dismiss} aria-label="Dismiss">
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      <div style={icon} aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
          <rect x="6" y="4" width="20" height="24" rx="3" fill="currentColor" />
          <rect x="2" y="9" width="5" height="2.5" rx="0.8" fill="currentColor" />
          <rect x="2" y="14.75" width="5" height="2.5" rx="0.8" fill="currentColor" />
          <rect x="2" y="20.5" width="5" height="2.5" rx="0.8" fill="currentColor" />
          <rect x="25" y="9" width="5" height="2.5" rx="0.8" fill="currentColor" />
          <rect x="25" y="14.75" width="5" height="2.5" rx="0.8" fill="currentColor" />
          <rect x="25" y="20.5" width="5" height="2.5" rx="0.8" fill="currentColor" />
          <path d="M18.5 7L10 17h5l-1.5 8L22 15h-5l1.5-8z" fill="#0a0a10" />
        </svg>
      </div>
      <div style={text}>
        <div style={title}>Nexus for iPhone</div>
        <div style={sub}>Open this page in the Nexus app.</div>
      </div>
      <button type="button" style={openBtn} onClick={openInApp}>
        Open
      </button>
    </div>
  );
}

const banner: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 14px 10px 36px',
  background: '#111118',
  borderBottom: '1px solid #2c2c36',
  color: '#f4f4f5',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};

const dismissBtn: React.CSSProperties = {
  position: 'absolute',
  left: 10,
  top: '50%',
  transform: 'translateY(-50%)',
  width: 22,
  height: 22,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: 6,
  color: '#a0a0b0',
  cursor: 'pointer',
};

const icon: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 34,
  height: 34,
  borderRadius: 8,
  background: '#1c1c26',
  color: '#f4f4f5',
  flexShrink: 0,
};

const text: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  lineHeight: 1.25,
};

const title: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
};

const sub: React.CSSProperties = {
  fontSize: 12,
  color: '#a0a0b0',
};

const openBtn: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  background: '#7c6ef8',
  color: '#fff',
  border: 'none',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
  flexShrink: 0,
};
