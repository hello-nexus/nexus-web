import { useEffect, useMemo, useState } from 'react';
import { NexusMark } from './components/icons/NexusBrand';
import { pairOverInternet, type InternetPairResult } from './api/internetPairing';
import { PHONE_PANEL_PWA_KEY } from './app/panelRouting';

/**
 * Landing page rendered when a phone scans the pairing QR.
 *
 * The QR encodes a Universal Link of the form
 *   https://hellonexus.com/r/pair?host=192.168.x.x&port=9443&pair=TOKEN&fp=SPKI_HASH
 *
 * If the Nexus iOS app is installed, iOS intercepts the Universal Link via
 * `application(_:continue:userActivity:)` and opens the app before this
 * component ever renders. If we get here the app did NOT take over (not
 * installed, Android, desktop, or an in-app browser).
 *
 * Pairing decision (Phase 1 internet pairing for brand-new phones):
 *   1. LAN-first fast path — try the HTTP claim against the PC's LAN address
 *      (host:httpPort) with a short timeout. On the same network this succeeds
 *      and we keep today's behavior: redirect into the LAN browser panel.
 *   2. Relay fallback — when the LAN is unreachable, pair over the cloud relay
 *      from the hellonexus.com origin (rid_pair derived from the QR `pair`
 *      token), store the returned session token, and run the panel over the
 *      relay right here on hellonexus.com (no LAN redirect). Reopening
 *      hellonexus.com reconnects via the relay using the stored token.
 *
 * We deliberately do not auto-fire the `hellonexus://` custom scheme here —
 * when the app isn't installed iOS Safari pops a "Cannot Open Page" error
 * dialog for an unregistered scheme, which is worse than the silent flow. The
 * Universal Link above already provides the dialog-free automatic app handoff.
 */

type PairPhase =
  | { state: 'pairing' }
  | { state: 'lan'; lanURL: string; host: string; httpPort: string }
  | { state: 'relay'; machineName?: string }
  | { state: 'rejected'; error: string }
  | { state: 'unreachable' };

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

  const [phase, setPhase] = useState<PairPhase>({ state: 'pairing' });

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    void pairOverInternet({
      host,
      httpPort,
      pairToken: pair,
      deviceName: deriveDeviceName(),
    }).then((result: InternetPairResult) => {
      if (cancelled) return;
      if (result.kind === 'lan') {
        // Fast path unchanged: hand the visitor straight to the LAN browser
        // panel. The PC already issued the token; the LAN panel uses it.
        const lanURL = `http://${host}:${httpPort}/panel/phone?pair=${encodeURIComponent(pair)}`;
        setPhase({ state: 'lan', lanURL, host, httpPort });
        window.location.replace(lanURL);
      } else if (result.kind === 'relay') {
        // Paired over the relay: the session token is stored under this origin.
        // Mark this as a phone panel and run the panel over the relay right
        // here on hellonexus.com — the multiplex hook's LAN /ws open fails
        // (localhost is unreachable from this origin) and falls back to the
        // relay using the stored token.
        localStorage.setItem(PHONE_PANEL_PWA_KEY, '1');
        setPhase({ state: 'relay', machineName: result.machineName });
        window.location.replace(`${window.location.origin}/panel/phone`);
      } else if (result.kind === 'rejected') {
        setPhase({ state: 'rejected', error: result.error });
      } else {
        setPhase({ state: 'unreachable' });
      }
    });
    return () => { cancelled = true; };
  }, [valid, host, httpPort, pair]);

  if (!valid) {
    return (
      <Frame>
        <Title>Invalid pairing link</Title>
        <Sub>This link is missing pairing information. Re-scan the QR from your dashboard.</Sub>
      </Frame>
    );
  }

  if (phase.state === 'rejected') {
    return (
      <Frame>
        <Title>Pairing expired</Title>
        <Sub>Generate a new QR from the Nexus dashboard ("Pair Phone") and scan it again.</Sub>
        {phase.error && <Sub mono>{phase.error}</Sub>}
      </Frame>
    );
  }

  if (phase.state === 'unreachable') {
    return (
      <Frame>
        <Title>Couldn't reach your PC</Title>
        <Sub>
          Make sure Nexus is running on your PC and that "Pair Remote" (and the cloud relay) are
          enabled in the dashboard, then re-scan the QR.
        </Sub>
      </Frame>
    );
  }

  if (phase.state === 'relay') {
    return (
      <Frame>
        <Title>Connecting over the internet…</Title>
        <Sub>{phase.machineName ? `Paired with ${phase.machineName}` : 'Paired — opening your panel.'}</Sub>
      </Frame>
    );
  }

  // 'pairing' (probing LAN, then relay) and 'lan' (redirect in flight) both
  // show the connecting card; 'lan' adds the manual Continue fallback in case
  // the auto-redirect is blocked.
  const lanURL = phase.state === 'lan' ? phase.lanURL : '';
  return (
    <Frame>
      <Title>Connecting to your PC…</Title>
      <Sub mono>{`${host}:${httpPort}`}</Sub>
      {lanURL && (
        <a href={lanURL} style={fallbackLink}>
          Continue
        </a>
      )}
    </Frame>
  );
}

// A short label for the pairing session list on the PC. The PC also records
// the user agent, so this only needs to be a friendly platform hint; keep it
// dependency-free (no UA-parser) per the project's least-code rule.
function deriveDeviceName(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Android phone';
  return 'Phone';
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
