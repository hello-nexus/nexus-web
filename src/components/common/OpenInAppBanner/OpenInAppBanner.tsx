import { useEffect, useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { NexusMark } from '../../icons/NexusBrand';

// Bumping the version suffix invalidates older "dismissed" state.
const DISMISS_KEY = 'nexus_open_in_app_banner_dismissed_v1';

type AppPlatform = 'ios' | 'android';

/**
 * Top banner shown on hellonexus.com when the visitor is on an iPhone/iPad or
 * an Android device. Tapping "Open" navigates to the `hellonexus://` custom
 * scheme, which the OS hands off to the Nexus app when installed. If the app is
 * not installed the browser silently does nothing (no error toast); the banner
 * stays put so the user can dismiss or ignore it.
 *
 * Self-gates so it never renders inside the native app's WebView (the app loads
 * `https://<lan-ip>:9443/panel/phone`, not hellonexus.com), on /r/* routes
 * (PairRedirect owns that flow), or on /panel/phone (the app's home).
 */
export function OpenInAppBanner() {
  const { t } = useTranslation();
  const [platform, setPlatform] = useState<AppPlatform | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(DISMISS_KEY) === '1') return;

    const host = window.location.hostname;
    const isProdHost = host === 'hellonexus.com' || host === 'www.hellonexus.com';
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
    const isAndroidDevice = /Android/.test(ua);
    if (!isIOSDevice && !isAndroidDevice) return;

    // Standalone PWA already runs outside the browser — no banner.
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    if (standalone) return;

    // Gating reads window globals (host / UA / standalone / localStorage), so
    // the visibility decision can only be made post-mount.
    setPlatform(isIOSDevice ? 'ios' : 'android');
  }, []);

  if (!platform) return null;

  const openInApp = () => {
    window.location.href = 'hellonexus://open';
  };

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setPlatform(null);
  };

  const titleText = platform === 'android'
    ? t('openInApp.titleAndroid')
    : t('openInApp.titleIos');

  return (
    <div style={banner} role="region" aria-label={t('openInApp.region')}>
      <button type="button" style={dismissBtn} onClick={dismiss} aria-label={t('openInApp.dismiss')}>
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      <div style={icon} aria-hidden="true">
        <NexusMark size={22} />
      </div>
      <div style={text}>
        <div style={title}>{titleText}</div>
        <div style={sub}>{t('openInApp.subtitle')}</div>
      </div>
      <button type="button" style={openBtn} onClick={openInApp}>
        {t('openInApp.open')}
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
  background: 'var(--bg-elevated)',
  borderBottom: '1px solid var(--border)',
  color: 'var(--text)',
  fontFamily: 'var(--font-sans)',
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
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-dim)',
  cursor: 'pointer',
};

const icon: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 34,
  height: 34,
  borderRadius: 'var(--radius-sm)',
  background: 'var(--surface)',
  color: 'var(--text)',
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
  color: 'var(--text-dim)',
};

const openBtn: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--accent)',
  color: 'var(--accent-text)',
  border: 'none',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
  flexShrink: 0,
};
