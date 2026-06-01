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
/**
 * A valid pairing QR always points at a private LAN IPv4 (the PC the phone
 * is pairing with). Only a bare private/loopback IPv4 literal is accepted; a
 * public IP, a DNS name, or any host carrying `/`, `@`, `:` or other URL
 * metacharacters is rejected so this public-origin page can never be turned
 * into an open redirect that leaks the pair token off-LAN.
 */
function isPrivateLanHost(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b, c, d] = m.slice(1).map(Number);
  if ([a, b, c, d].some((n) => n > 255)) return false;
  return (
    a === 10 ||                          // 10.0.0.0/8
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) ||          // 192.168.0.0/16
    (a === 169 && b === 254) ||          // 169.254.0.0/16 link-local
    a === 127                            // loopback
  );
}

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
  // browser fallback only needs host + pair + httpPort. A valid QR always
  // carries a private LAN IPv4 host. We MUST reject anything else: this page is
  // served from the public hellonexus.com origin, so an unvalidated `host` turns
  // it into an open redirect that carries the `pair` token to an attacker
  // (host=evil.com, userinfo/@ tricks, public IPs). httpPort must be numeric so
  // it can't smuggle a path/host segment into the URL either.
  const valid = Boolean(pair) && isPrivateLanHost(host) && /^\d{1,5}$/.test(httpPort);
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
