import { useEffect, useMemo } from 'react';
import { NexusMark } from './components/icons/NexusBrand';

/**
 * Landing page rendered when a phone scans the pairing QR.
 *
 * The QR encodes a Universal Link of the form
 *   https://hellonexus.com/r/pair?host=192.168.x.x&port=9443&pair=TOKEN&fp=SPKI_HASH
 *
 * If the Nexus iOS app is installed, iOS intercepts the Universal Link via
 * `application(_:continue:userActivity:)` and opens the app before this
 * component ever renders. If we get here the app did NOT take over (not
 * installed, Android, desktop, or an in-app browser), so for now we bypass the
 * chooser entirely and send the user straight to the LAN browser panel.
 *
 * Simple-for-now: no "open in app vs. browser" prompt. We deliberately do not
 * auto-fire the `hellonexus://` custom scheme here — when the app isn't installed
 * iOS Safari pops a "Cannot Open Page" error dialog for an unregistered scheme,
 * which is worse than the silent redirect. The Universal Link above already
 * provides the dialog-free automatic app handoff. This whole flow is meant to
 * be revisited later.
 */
export function PairRedirect() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const host = params.get('host') ?? '';
  const pair = params.get('pair') ?? '';
  // The browser fallback can't trust the service's self-signed LAN cert, so we
  // route the redirect to the plain-HTTP listener instead. New QRs carry
  // `httpPort`; older ones don't, in which case the service-port default is the
  // only sane guess.
  const httpPort = params.get('httpPort') ?? '9400';

  // Validity guard: native iOS uses `port` for the HTTPS-pinned path, but the
  // browser fallback only needs host + pair + httpPort. Any QR carrying both
  // host and pair is good enough; missing iOS-only fields shouldn't reject it.
  const valid = Boolean(host && pair);
  const lanURL = valid
    ? `http://${host}:${httpPort}/panel/phone?pair=${encodeURIComponent(pair)}`
    : '';

  // Auto-bypass: hand the visitor straight to the browser panel. `replace` so
  // the redirect page doesn't sit in history (back button skips it).
  useEffect(() => {
    if (lanURL) window.location.replace(lanURL);
  }, [lanURL]);

  if (!valid) {
    return (
      <Frame>
        <Title>Invalid pairing link</Title>
        <Sub>This link is missing pairing information. Re-scan the QR from your dashboard.</Sub>
      </Frame>
    );
  }

  return (
    <Frame>
      <Title>Connecting to your PC…</Title>
      <Sub mono>{`${host}:${httpPort}`}</Sub>
      {/* Manual fallback for the rare case the auto-redirect is blocked. */}
      <a href={lanURL} style={fallbackLink}>
        Continue
      </a>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div style={frame}>
      <div style={card}>
        <div style={logoStyle}>
          <NexusMark size={64} />
        </div>
        {children}
      </div>
    </div>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return <div style={titleStyle}>{children}</div>;
}

function Sub({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return <div style={mono ? { ...subStyle, fontFamily: 'var(--font-mono)' } : subStyle}>{children}</div>;
}

const frame: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  background: 'var(--bg)',
  color: 'var(--text)',
  fontFamily: 'var(--font-sans)',
};

const card: React.CSSProperties = {
  maxWidth: 360,
  width: '100%',
  padding: 32,
  borderRadius: 'var(--radius-lg)',
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  textAlign: 'center',
};

const logoStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: 20,
  color: 'var(--text)',
};

const titleStyle: React.CSSProperties = {
  fontSize: 'var(--type-heading)',
  fontWeight: 700, // --weight-heading
  marginBottom: 6,
};

const subStyle: React.CSSProperties = {
  fontSize: 'var(--type-small)',
  color: 'var(--text-dim)',
  lineHeight: 1.5,
};

const fallbackLink: React.CSSProperties = {
  display: 'inline-block',
  marginTop: 24,
  padding: '10px 18px',
  borderRadius: 'var(--radius)',
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text)',
  fontSize: 'var(--type-small)',
  fontWeight: 600,
  textDecoration: 'none',
};
