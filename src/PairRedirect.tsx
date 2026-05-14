import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { APP_STORE_URL } from './lib/appStore';

const APP_LINK_PROBE_MS = 1500;
const CUSTOM_SCHEME_PROBE_MS = 1500;

/**
 * Tiny landing page rendered when a phone scans the pairing QR but the
 * Qos iOS app is not installed (or the user is on Android / a desktop).
 *
 * The QR encodes a Universal Link of the form
 *   https://nexusqos.com/r/pair?host=192.168.x.x&port=9443&pair=TOKEN&fp=SPKI_HASH
 *
 * If the iOS app is installed, iOS intercepts the URL and opens the app via
 * `application(_:continue:userActivity:)` - this component never renders.
 * If not installed, this page lets the user either install the app (App Store)
 * or continue in the mobile browser, redirected to the LAN URL the QR encoded.
 *
 * The "Open in Qos app" button is a manual fallback: if the user landed here
 * despite having the app installed (Chrome on iOS, in-app browser, AASA cache
 * miss), tapping it navigates to `nexusqos://r/pair?...` via the registered
 * custom URL scheme. We use a visibility-change probe to detect whether the
 * app actually opened; if not, we surface the install/browser fallbacks. If
 * the user returns to Safari after the handoff, the probe transitions back
 * to the choose stage so they're not stuck on the "Opening..." screen.
 */
export function PairRedirect() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const host = params.get('host') ?? '';
  const pair = params.get('pair') ?? '';
  // The browser fallback can't trust the service's self-signed LAN cert, so
  // we route the redirect to the plain-HTTP listener instead. New QRs carry
  // `httpPort`; older ones don't, in which case the service-port default is
  // the only sane guess.
  const httpPort = params.get('httpPort') ?? '9400';

  const [stage, setStage] = useState<'loading' | 'choose' | 'opening-app' | 'app-missing' | 'redirecting'>('loading');
  const customSchemeTimer = useRef<number | null>(null);

  // Probe for app handover via Universal Link: if iOS opens the app, this
  // component unmounts. After the probe window we consider the app missing
  // and show the choices.
  useEffect(() => {
    const t = window.setTimeout(() => setStage('choose'), APP_LINK_PROBE_MS);
    return () => window.clearTimeout(t);
  }, []);

  // Visibility-change probe for the custom-scheme handover. Two outcomes:
  //   1. Page goes hidden before the timeout: the OS handed off to the app.
  //      Clear the timer; if Safari later regains focus (user returned from
  //      the app), bounce back to 'choose' so they're not stuck on
  //      "Opening Qos app..." forever.
  //   2. Page stays visible past the timeout: the scheme isn't registered,
  //      so the app probably isn't installed; show 'app-missing' fallbacks.
  useEffect(() => {
    if (stage !== 'opening-app') return;
    let wasHidden = false;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        wasHidden = true;
        if (customSchemeTimer.current != null) {
          window.clearTimeout(customSchemeTimer.current);
          customSchemeTimer.current = null;
        }
      } else if (wasHidden) {
        setStage('choose');
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    customSchemeTimer.current = window.setTimeout(() => {
      customSchemeTimer.current = null;
      setStage('app-missing');
    }, CUSTOM_SCHEME_PROBE_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (customSchemeTimer.current != null) {
        window.clearTimeout(customSchemeTimer.current);
        customSchemeTimer.current = null;
      }
    };
  }, [stage]);

  const openInApp = useCallback(() => {
    // Reuse the exact query string so the app gets the same pair token, host,
    // port, and fingerprint that the QR encoded.
    const appUrl = `nexusqos://r/pair?${window.location.search.replace(/^\?/, '')}`;
    setStage('opening-app');
    window.location.href = appUrl;
  }, []);

  // Validity guard: native iOS uses `port` for the HTTPS-pinned path, but the
  // browser fallback only needs host + pair + httpPort. Any QR carrying both
  // host and pair is good enough; missing iOS-only fields shouldn't reject it.
  if (!host || !pair) {
    return (
      <Frame>
        <Title>Invalid pairing link</Title>
        <Sub>This link is missing pairing information. Re-scan the QR from your dashboard.</Sub>
      </Frame>
    );
  }

  if (stage === 'loading') {
    return (
      <Frame>
        <Title>Opening Qos...</Title>
        <Sub>If the app is installed, it will take over in a moment.</Sub>
      </Frame>
    );
  }

  if (stage === 'opening-app') {
    return (
      <Frame>
        <Title>Opening Qos app...</Title>
        <Sub>If nothing happens, the app isn't installed on this device.</Sub>
      </Frame>
    );
  }

  const lanURL = `http://${host}:${httpPort}/panel/phone?pair=${encodeURIComponent(pair)}`;

  if (stage === 'redirecting') {
    return (
      <Frame>
        <Title>Connecting to your PC...</Title>
        <Sub>{`http://${host}:${httpPort}/panel/phone`}</Sub>
      </Frame>
    );
  }

  const appMissing = stage === 'app-missing';

  return (
    <Frame>
      <Title>Pair phone with Qos</Title>
      <Sub>
        {appMissing
          ? "The Qos app doesn't seem to be installed on this device."
          : 'Choose how you want to continue.'}
      </Sub>

      {!appMissing && (
        <button type="button" style={btnPrimary} onClick={openInApp}>
          Open in Qos app
        </button>
      )}

      <button
        type="button"
        style={appMissing ? btnPrimary : btnSecondary}
        onClick={() => {
          setStage('redirecting');
          window.location.href = lanURL;
        }}
      >
        Continue in browser
      </button>

      <a href={APP_STORE_URL} style={btnSecondary}>
        Get the app
      </a>

      <Sub style={{ marginTop: 24, fontSize: 12 }}>
        Browser fallback only works on a trusted home network. The Qos app uses end-to-end encryption.
      </Sub>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div style={frame}>
      <div style={card}>
        <Logo />
        {children}
      </div>
    </div>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return <div style={titleStyle}>{children}</div>;
}

function Sub({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ ...subStyle, ...style }}>{children}</div>;
}

function Logo() {
  return (
    <div style={logoStyle}>
      <svg width="36" height="36" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
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
  );
}

const frame: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  background: '#0a0a10',
  color: '#f4f4f5',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};

const card: React.CSSProperties = {
  maxWidth: 360,
  width: '100%',
  padding: 32,
  borderRadius: 18,
  background: '#111118',
  textAlign: 'center',
  boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
};

const logoStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: 16,
  color: '#f4f4f5',
};

const titleStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  marginBottom: 6,
};

const subStyle: React.CSSProperties = {
  fontSize: 14,
  color: '#a0a0b0',
  marginBottom: 24,
  lineHeight: 1.5,
};

const btnPrimary: React.CSSProperties = {
  display: 'block',
  textDecoration: 'none',
  textAlign: 'center',
  padding: '14px 16px',
  borderRadius: 12,
  background: '#7c6ef8',
  color: '#fff',
  fontWeight: 600,
  fontSize: 15,
  marginBottom: 12,
  width: '100%',
  border: 'none',
  cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textDecoration: 'none',
  textAlign: 'center',
  padding: '14px 16px',
  borderRadius: 12,
  background: '#1c1c26',
  color: '#f4f4f5',
  fontWeight: 600,
  fontSize: 15,
  border: '1px solid #2c2c36',
  cursor: 'pointer',
  marginBottom: 12,
};
