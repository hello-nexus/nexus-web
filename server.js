import express from 'express';
import compression from 'compression';
import { fileURLToPath } from 'url';
import { basename, dirname, join, sep } from 'path';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;
const indexHtmlPath = join(__dirname, 'dist', 'index.html');

app.use(compression());

// Apple's CDN fetches /.well-known/apple-app-site-association without a file
// extension; without an explicit route, express.static skips dotfile dirs and
// the SPA catchall returns index.html, breaking Universal Links. The explicit
// route also forces Content-Type: application/json (the file has no extension
// so mime detection would otherwise pick application/octet-stream).
app.get('/.well-known/apple-app-site-association', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.type('application/json');
  res.sendFile(join(__dirname, 'dist', '.well-known', 'apple-app-site-association'), {
    dotfiles: 'allow',
  });
});

// Android App Links fetch /.well-known/assetlinks.json - same dotfile-dir
// problem as the Apple file above: express.static skips it and the SPA
// catchall returns index.html, so Play can't verify the link.
app.get('/.well-known/assetlinks.json', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.type('application/json');
  res.sendFile(join(__dirname, 'dist', '.well-known', 'assetlinks.json'), {
    dotfiles: 'allow',
  });
});

// Public installer download redirects. The actual binaries live in
// hello-nexus/nexus (a separate public repo); these routes 302 to
// GitHub's `latest/download/<asset>` alias so the URLs we hand out from
// hellonexus.com / marketing material never need to change when we cut a
// new version. `Cache-Control: no-store` prevents Cloudflare (in front of
// hellonexus.com) from pinning a stale Location header if the asset map is
// edited - the binary itself is on GitHub and out of scope here.
//
// Linux is intentionally absent: there's no Linux build published yet, so
// Linux UAs and any /download/linux hit fall through to the SPA, which
// shows the chooser with a "coming soon" affordance instead of a 404.
const RELEASES_BASE = 'https://github.com/hello-nexus/nexus/releases/latest/download';
const DOWNLOAD_ASSETS = {
  windows: 'Nexus-Setup.exe',
  macos: 'Nexus.dmg',
};

function detectOSFromUA(ua) {
  const s = (ua || '').toLowerCase();
  // iPadOS 13+ Safari reports as "Macintosh" - exclude iOS/iPadOS first so
  // tablet/phone visitors fall through to the chooser instead of being
  // handed an unusable .dmg.
  if (s.includes('iphone') || s.includes('ipad') || s.includes('ipod')) return null;
  if (s.includes('windows')) return 'windows';
  if (s.includes('mac os') || s.includes('macintosh')) return 'macos';
  return null;
}

function redirectToAsset(res, os) {
  res.set('Cache-Control', 'no-store');
  return res.redirect(`${RELEASES_BASE}/${DOWNLOAD_ASSETS[os]}`);
}

function redirectToChooser(res) {
  res.set('Cache-Control', 'no-store');
  return res.redirect('/');
}

app.get(['/download', '/downloads'], (req, res) => {
  const os = detectOSFromUA(req.get('user-agent'));
  if (!os) return redirectToChooser(res);
  return redirectToAsset(res, os);
});

app.get(['/download/win', '/download/windows', '/downloads/win', '/downloads/windows'],
  (_req, res) => redirectToAsset(res, 'windows'));
app.get(['/download/mac', '/download/macos', '/downloads/mac', '/downloads/macos'],
  (_req, res) => redirectToAsset(res, 'macos'));
app.get(['/download/linux', '/downloads/linux'], (_req, res) => redirectToChooser(res));

// OG meta injection for /u/:username link previews (Discord, Slack, iMessage,
// etc. - they render og:* tags from the raw HTML response, never execute the
// SPA's JS). The SPA itself still serves the actual page and its
// not-found/private states; this only decorates the <head> for crawlers.
const NEXUS_API_BASE = process.env.NEXUS_API_BASE || 'https://api.hellonexus.com';
const PROFILE_OG_TIMEOUT_MS = 2000;
const PROFILE_OG_CACHE_MS = 60_000;
// :username is attacker-controlled on a public route; cap entries so an
// enumeration scrape can't grow this map unbounded. Map preserves insertion
// order, so the oldest entry is evicted first; entries expire fast enough
// that approximate LRU adds nothing.
const PROFILE_OG_CACHE_MAX_ENTRIES = 1000;
const profileOgCache = new Map(); // lower(username) -> { account: object|null, expiresAt: number }

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Returns the public profile (or null for unknown/private/unreachable) with a
// short in-memory cache so a hot profile link doesn't hammer nexus-api.
async function fetchProfileForOg(username) {
  const key = username.toLowerCase();
  const cached = profileOgCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.account;

  let account = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROFILE_OG_TIMEOUT_MS);
    const res = await fetch(`${NEXUS_API_BASE}/u/${encodeURIComponent(username)}`, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) account = await res.json();
  } catch {
    account = null;
  }

  if (profileOgCache.size >= PROFILE_OG_CACHE_MAX_ENTRIES) {
    profileOgCache.delete(profileOgCache.keys().next().value);
  }
  profileOgCache.set(key, { account, expiresAt: Date.now() + PROFILE_OG_CACHE_MS });
  return account;
}

app.get('/u/:username', async (req, res) => {
  const account = await fetchProfileForOg(req.params.username);

  // Unknown/private accounts get neutral tags - no 404 at the HTML level (the
  // SPA renders the not-found/private state); only a genuinely public account
  // gets its username and avatar in the preview.
  let title = 'Nexus';
  let description = 'The next generation of Nexus is almost here.';
  let image = null;
  if (account && account.isPrivate === false) {
    title = `${account.username} on Nexus`;
    description = `${account.username}'s machines and profile on Nexus.`;
    if (account.avatar && account.avatar.large) image = account.avatar.large;
  }

  const ogTags = [
    `<meta property="og:type" content="profile">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    image ? `<meta property="og:image" content="${escapeHtml(image)}">` : '',
  ].filter(Boolean).join('\n    ');

  // Read fresh per request (small file, low-traffic route) rather than
  // caching at module load - matches the SPA catchall's freshness guarantee
  // below so a redeploy without a process restart never serves a shell
  // referencing purged content-hashed asset filenames.
  const indexHtml = readFileSync(indexHtmlPath, 'utf8');
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(indexHtml.replace('</head>', `    ${ogTags}\n  </head>`));
});

// Host-routed root: my.hellonexus.com (and my.localhost for local prod
// preview - browsers resolve *.localhost to loopback) is the app surface and
// gets the SPA shell; every other host (hellonexus.com, www, the Railway
// internal domain, plain localhost) gets the marketing page. ONLY `/` is
// host-dependent - every deeper path (/r/pair, /panel/phone, /login, /u/*,
// /auth/*, /download*, .well-known) keeps serving identically on all hosts:
// relay-paired phones hold session tokens under the hellonexus.com origin,
// QR codes and account emails embed hellonexus.com URLs.
function isMySystemHost(req) {
  const host = String(req.headers.host || '').split(':')[0].toLowerCase();
  return host === 'my.hellonexus.com' || host === 'my.localhost';
}

app.get('/', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  const file = isMySystemHost(req) ? 'index.html' : join('site', 'index.html');
  res.sendFile(file, { root: join(__dirname, 'dist') });
});

app.use(express.static(join(__dirname, 'dist'), {
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    // Vite emits content-hashed build outputs FLAT in dist/assets/ (e.g.
    // index-B3qUJaPz.js); the URL changes whenever the bytes do, so cache them
    // forever. Files copied verbatim from public/ keep their sub-path with a
    // STABLE name (e.g. /assets/devices/y70.svg) - those must NOT be immutable
    // or an icon edit is stuck stale for a year. So: immutable only for a direct
    // child of /assets/, never a nested verbatim copy.
    const assetsAt = filePath.indexOf(`${sep}assets${sep}`);
    if (assetsAt !== -1) {
      const rest = filePath.slice(assetsAt + `${sep}assets${sep}`.length);
      if (!rest.includes(sep)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return;
      }
      // nested copy (assets/devices/*.svg) → fall through to the maxAge default.
    }
    // sw.js, the SPA shell, and the manifests MUST always be revalidated.
    // sw.js is the one that matters: served with a long max-age (the old blanket
    // 1d) it gets pinned by the browser/CDN, and Safari's SW update check then
    // re-activates a stale/duplicate worker on nearly every load, firing
    // controllerchange → window.location.reload() in an endless loop. no-cache
    // forces a conditional revalidation against origin every time so the worker
    // the browser holds is always the current one.
    const name = basename(filePath);
    if (name === 'sw.js' || name === 'index.html' || name.endsWith('.webmanifest')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
    // Everything else (favicon, icons.svg, fonts, device SVGs) keeps the
    // maxAge:'1d' default set above - unchanged from prior behavior.
  },
}));
// Express 5 / send v1+ requires an explicit `root` option for sendFile,
// otherwise absolute paths come back with a NotFoundError even when the
// file exists. The SPA catchall was returning 404 for every deep link
// (e.g. /my-computer/devices) without it. The shell must revalidate (see
// above) so a stale index.html never points at purged asset hashes.
app.get('/{*path}', (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile('index.html', { root: join(__dirname, 'dist') });
});

app.listen(port, () => console.log(`nexus-web on port ${port}`));
