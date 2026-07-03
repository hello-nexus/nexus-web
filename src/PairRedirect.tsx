import { useEffect, useMemo, useRef, useState } from 'react';
import { NexusMark } from './components/icons/NexusBrand';
import { Spinner } from './components/common/Spinner/Spinner';
import { pairOverInternet, pairOverRelayClaim, type InternetPairResult } from './api/internetPairing';
import { isRemoteOrigin, setRelayRegion } from './api/service';
import { getDeviceId } from './api/deviceId';
import { upsertPairedPc } from './api/pairedPcs';
import { PHONE_PANEL_PWA_KEY } from './app/panelRouting';
import { deriveDeviceLabel } from './lib/platform';

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
 * Pairing decision (Phase 1 internet pairing for brand-new phones). DIRECT LAN
 * is the primary path; the paid relay is only a fallback:
 *
 *   LOCAL ORIGIN (the PC's own panel on :9400/:9443, isServedFromService):
 *     keep today's behavior - pairOverInternet() does the LAN HTTP claim and,
 *     if the PC is unreachable, falls back to the relay.
 *
 *   REMOTE ORIGIN (hellonexus.com, served over https, isRemoteOrigin):
 *     TIER 1 (direct LAN, free): NAVIGATE straight to the PC's plain-HTTP panel
 *       (http://<host>:9400/panel/phone?pair=…). A navigation is NOT a fetch, so
 *       it is exempt from mixed-content / WebKit "access control" aborts. On the
 *       same LAN this commits and the PC-served panel (isServedFromService=true)
 *       runs the direct same-origin claim - the relay is never used (free).
 *     TIER 2 (relay fallback): a {@link DIRECT_PROBE_MS} timer is armed right
 *       before the Tier-1 navigation. If the direct page commits (LAN reachable)
 *       this hellonexus.com page unloads and the timer dies, so the relay never
 *       runs (no double-claim). If it does NOT commit (PC off-LAN/unreachable)
 *       the timer fires and pairOverRelayClaim() pairs over the cloud relay,
 *       then runs the panel over the relay right here on hellonexus.com.
 *
 * We deliberately do not auto-fire the `hellonexus://` custom scheme here -
 * when the app isn't installed iOS Safari pops a "Cannot Open Page" error
 * dialog for an unregistered scheme, which is worse than the silent flow. The
 * Universal Link above already provides the dialog-free automatic app handoff.
 */

// How long to give the direct-LAN navigation (TIER 1) to commit before falling
// back to the cloud relay (TIER 2). On the same LAN the PC's plain-HTTP panel
// loads well inside this window, this page unloads, and the timer is destroyed
// - so the relay never runs (no double-claim). Off-LAN the navigation can't
// commit (connection refused / unroutable private IP), the timer fires, and the
// relay claim starts. ~3s balances "don't make an on-LAN phone wait" against
// "give a slow-but-reachable PC time to answer before paying for the relay".
const DIRECT_PROBE_MS = 3000;

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
  // Regional relay tag (e.g. "ap"): the relay claim + the runtime panel both
  // target the relay the host registered on. Absent ⇒ legacy default.
  const region = params.get('r') ?? '';
  // PC's leaf cert fingerprint. Carried in the QR for both native pinning and
  // (forwarded below into directUrl) the paired-PC record's dedup key - the
  // LAN claim response itself carries no spki of its own.
  const fp = params.get('fp') ?? '';

  // Validity guard: native iOS uses `port` for the HTTPS-pinned path, but the
  // browser fallback only needs host + pair + httpPort. Any QR carrying both
  // host and pair is good enough; missing iOS-only fields shouldn't reject it.
  //
  // On a REMOTE origin TIER 1 NAVIGATES the browser to http://<host>:9400.
  // `host` comes from the (untrusted) QR URL, so require it to be a private
  // (RFC1918 / link-local) LAN IP: a direct PC pairing target is always a LAN
  // address, and this stops a crafted hellonexus.com/r/pair link from
  // navigating the phone to an arbitrary public host. The relay path keys off
  // `pair` (not `host`), so a rejected host still can't be abused there either.
  const valid = Boolean(host && pair && isPrivateLanHost(host));

  const [phase, setPhase] = useState<PairPhase>({ state: 'pairing' });

  // Start the pair attempt at most once for this component's lifetime. The
  // module-level guard in pairOverInternet already collapses repeat calls for
  // the same token onto one relay claim, but this also stops a remount/effect
  // re-run from even re-entering the effect body (and from re-applying a stale
  // result after the redirect is in flight). Together they guarantee a single
  // rid_pair relay channel per pair attempt.
  const started = useRef(false);

  useEffect(() => {
    if (!valid) return;
    if (started.current) return;
    started.current = true;

    // Persist the QR's relay region before any claim so the relay claim and the
    // post-pair runtime panel (resolveRelayWs) both hit the relay the host is on.
    setRelayRegion(region);

    // The direct-LAN panel URL: plain HTTP, the service's HTTP port (9400).
    // Carry the stable per-device id so the PC-served panel's same-origin claim
    // sends the SAME deviceId it would have over the relay - a QR scan dedups to
    // one authorized-device session whether it ends up LAN-direct or relay.
    // The fp param carries the QR's spki forward so that same-origin claim can
    // record it on the paired-PC entry (PanelEntrypoint reads it back).
    const directUrl = `http://${host}:${httpPort}/panel/phone?pair=${encodeURIComponent(pair)}&deviceId=${encodeURIComponent(getDeviceId())}`
      + (fp ? `&fp=${encodeURIComponent(fp)}` : '');

    // Settle the relay outcome (shared by both origins' relay paths). The relay
    // session token is stored under this origin, so render the panel over the
    // relay right here on hellonexus.com - the multiplex hook's LAN /ws open
    // fails (localhost is unreachable from this origin) and falls back to the
    // relay using the stored token.
    const applyResult = (result: InternetPairResult) => {
      if (result.kind === 'relay') {
        localStorage.setItem(PHONE_PANEL_PWA_KEY, '1');
        upsertPairedPc({
          machineName: result.machineName,
          token: result.token,
          spki: result.spki,
          relayRegion: region,
        });
        setPhase({ state: 'relay', machineName: result.machineName });
        window.location.replace(`${window.location.origin}/panel/phone`);
      } else if (result.kind === 'rejected') {
        setPhase({ state: 'rejected', error: result.error });
      } else {
        setPhase({ state: 'unreachable' });
      }
    };

    // REMOTE ORIGIN - tiered: direct LAN first (free), relay only on timeout.
    if (isRemoteOrigin) {
      let cancelled = false;
      // TIER 2 fallback armed BEFORE the TIER 1 navigation. If the direct
      // navigation commits (LAN reachable) this page unloads and the timer is
      // cleared below by the effect cleanup → relay never runs (no double
      // claim). If it does NOT commit (PC off-LAN) the timer fires and the
      // relay claim starts. This is the proven "navigate, fall back after a
      // timeout" technique; the timer is the only signal we get that the
      // off-LAN navigation silently failed to commit.
      const fallback = window.setTimeout(() => {
        if (cancelled) return;
        // The Tier-1 direct nav never committed (PC off-LAN/unreachable), so a
        // top-level navigation to the unreachable PC is still pending. Abort it
        // BEFORE starting the relay claim: on WebKit a hung in-flight navigation
        // interferes with the relay WS path (the close of the post-claim relay
        // channel races the stuck nav). On the LAN-reachable case the direct nav
        // already committed and this page unloaded, so this code never runs.
        try { window.stop(); } catch { /* not supported / nothing to stop */ }
        setPhase({ state: 'relay' });
        void pairOverRelayClaim(pair, deriveDeviceLabel()).then((result) => {
          if (cancelled) return;
          applyResult(result);
        });
      }, DIRECT_PROBE_MS);

      // TIER 1: NAVIGATE to the PC's plain-HTTP panel. A navigation (not a
      // fetch) is exempt from mixed-content / WebKit access-control aborts.
      setPhase({ state: 'lan', lanURL: directUrl, host, httpPort });
      window.location.href = directUrl;

      return () => {
        cancelled = true;
        window.clearTimeout(fallback);
      };
    }

    // LOCAL ORIGIN (PC's own panel) - unchanged: LAN HTTP claim, relay fallback.
    let cancelled = false;
    void pairOverInternet({
      host,
      httpPort,
      pairToken: pair,
      deviceName: deriveDeviceLabel(),
    }).then((result: InternetPairResult) => {
      if (cancelled) return;
      if (result.kind === 'lan') {
        // Fast path unchanged: hand the visitor straight to the LAN browser
        // panel. The PC already issued the token; the LAN panel uses it.
        upsertPairedPc({
          machineName: result.machineName,
          token: result.token,
          spki: fp || undefined,
          host,
          httpPort,
        });
        setPhase({ state: 'lan', lanURL: directUrl, host, httpPort });
        window.location.replace(directUrl);
      } else {
        applyResult(result);
      }
    });
    return () => { cancelled = true; };
  }, [valid, host, httpPort, pair, region, fp]);

  // NOTE: this component is mounted by App.tsx at /r/pair WITHOUT an
  // I18nProvider ancestor, so useTranslation()'s t() would return raw keys
  // instead of copy. The phone-landing strings below therefore stay literal
  // English until this route is given an i18n context; the lint disables mark
  // that intentional gap.
  if (!valid) {
    return (
      <Frame>
        {/* eslint-disable i18next/no-literal-string -- renders outside I18nProvider, see file note */}
        <Title>Invalid pairing link</Title>
        <Sub>This link is missing pairing information. Re-scan the QR from your dashboard.</Sub>
        {/* eslint-enable i18next/no-literal-string */}
      </Frame>
    );
  }

  if (phase.state === 'rejected') {
    return (
      <Frame>
        {/* eslint-disable i18next/no-literal-string -- renders outside I18nProvider, see file note */}
        <Title>Pairing expired</Title>
        <Sub>Generate a new QR from the Nexus dashboard ("Pair Phone") and scan it again.</Sub>
        {/* eslint-enable i18next/no-literal-string */}
        {phase.error && <Sub mono>{phase.error}</Sub>}
      </Frame>
    );
  }

  if (phase.state === 'unreachable') {
    return (
      <Frame>
        {/* eslint-disable i18next/no-literal-string -- renders outside I18nProvider, see file note */}
        <Title>Couldn't reach your PC</Title>
        <Sub>
          Make sure Nexus is running on your PC and that "Pair Remote" (and the cloud relay) are
          enabled in the dashboard, then re-scan the QR.
        </Sub>
        {/* eslint-enable i18next/no-literal-string */}
      </Frame>
    );
  }

  if (phase.state === 'relay') {
    return (
      <Frame>
        <div style={spinnerFrame}><Spinner size={32} /></div>
      </Frame>
    );
  }

  // 'pairing' (probing LAN, then relay) and 'lan' (redirect in flight) both
  // show the connecting spinner; 'lan' adds the manual Continue fallback in
  // case the auto-redirect is blocked.
  const lanURL = phase.state === 'lan' ? phase.lanURL : '';
  return (
    <Frame>
      <div style={spinnerFrame}><Spinner size={32} /></div>
      {lanURL && (
        // eslint-disable-next-line i18next/no-literal-string -- renders outside I18nProvider, see file note
        <a href={lanURL} style={fallbackLink}>
          Continue
        </a>
      )}
    </Frame>
  );
}

// True only for a private (RFC1918 / link-local) IPv4 LAN address - the only
// kind of host a Nexus PC advertises in a pairing QR. TIER 1 NAVIGATES the
// phone to http://<host>:9400, so an untrusted QR `host` must be confined to
// the LAN; a public host is rejected (the QR is treated as invalid). Ranges:
// 10/8, 172.16/12, 192.168/16, and 169.254/16 (link-local).
function isPrivateLanHost(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host.trim());
  if (!m) return false;
  const [a, b, c, d] = m.slice(1).map(Number);
  if ([a, b, c, d].some((n) => n > 255)) return false;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
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
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  textAlign: 'center',
};

// Spinner.module.scss forces display:block on the SVG, so card's
// textAlign:center (which only centers inline content, for Title/Sub text)
// leaves it flush against the left edge - center it explicitly instead,
// matching how every other Spinner consumer in the app is a flex parent.
const spinnerFrame: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
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
