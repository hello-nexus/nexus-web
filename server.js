import express from 'express';
import compression from 'compression';
import { fileURLToPath } from 'url';
import { basename, dirname, join, sep } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;

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
// hello-nexus/nexus (a separate public repo). The per-OS routes are the
// canonical URLs marketing material hands out - they never change across
// versions. Each 302s to the newest downloadable release's asset, resolved
// via the GitHub API: the latest stable when one exists, otherwise the
// newest prerelease (no stable has shipped yet, so GitHub's static
// `latest/download/<asset>` alias 404s; it remains the fallback when the
// API is unreachable so a stable-era outage degrades gracefully).
// `Cache-Control: no-store` prevents Cloudflare (in front of hellonexus.com)
// from pinning a stale Location header.
const RELEASES_BASE = 'https://github.com/hello-nexus/nexus/releases/latest/download';
const RELEASES_API = 'https://api.github.com/repos/hello-nexus/nexus/releases?per_page=15';
const DOWNLOAD_ASSETS = {
  windows: 'Nexus-Setup.exe',
  macos: 'Nexus.dmg',
  linux: 'Nexus-Linux-x64.tar.gz',
};
const RELEASE_CACHE_MS = 10 * 60_000;
// A failed refresh keeps serving the last-good data and retries sooner - the
// static-alias fallback 404s while no stable release exists, so nulling the
// cache on a blip would re-break every download for the full TTL.
const RELEASE_RETRY_MS = 60_000;
const RELEASE_API_TIMEOUT_MS = 3000;
let releaseCache = { data: null, expiresAt: 0 };
let releaseRefresh = null;

// { byName, sizeByName, version } for the newest downloadable release, or null.
// byName maps asset name -> download URL, sizeByName maps asset name -> byte
// size, version is the release tag. One API poll feeds both the /download
// redirect and /download/manifest, so the two never disagree.
async function fetchReleaseData() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RELEASE_API_TIMEOUT_MS);
  try {
    const res = await fetch(RELEASES_API, {
      signal: controller.signal,
      headers: { accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    // Only releases carrying every per-OS asset qualify - a release caught
    // mid-CI-upload must not become the redirect target.
    const wanted = Object.values(DOWNLOAD_ASSETS);
    const usable = (await res.json()).filter((r) => !r.draft
      && wanted.every((name) => r.assets?.some((a) => a.name === name)));
    const pick = usable.find((r) => !r.prerelease) ?? usable[0];
    if (!pick) return null;
    return {
      byName: Object.fromEntries(pick.assets.map((a) => [a.name, a.browser_download_url])),
      sizeByName: Object.fromEntries(pick.assets.map((a) => [a.name, a.size])),
      version: typeof pick.tag_name === 'string' ? pick.tag_name : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Release data for the newest downloadable release, or null when the API has
// never answered (callers fall back to the static alias). Concurrent expiries
// share one in-flight refresh (unauthenticated GitHub API allows 60 req/h/IP).
async function resolveReleaseData() {
  if (releaseCache.expiresAt > Date.now()) return releaseCache.data;
  releaseRefresh ??= fetchReleaseData().then((data) => {
    releaseCache = data
      ? { data, expiresAt: Date.now() + RELEASE_CACHE_MS }
      : { data: releaseCache.data, expiresAt: Date.now() + RELEASE_RETRY_MS };
    releaseRefresh = null;
    return releaseCache.data;
  });
  return releaseRefresh;
}

async function redirectToAsset(res, os) {
  const assetName = DOWNLOAD_ASSETS[os];
  const data = await resolveReleaseData();
  res.set('Cache-Control', 'no-store');
  return res.redirect(data?.byName?.[assetName] ?? `${RELEASES_BASE}/${assetName}`);
}

// Bare /download serves the marketing downloads page (all platforms +
// version); the SPA-shell fallthrough below routes it in the site bundle.
app.get(['/download', '/downloads'], (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(join('site', 'index.html'), { root: join(__dirname, 'dist') });
});

app.get(['/download/win', '/download/windows', '/downloads/win', '/downloads/windows'],
  (_req, res) => redirectToAsset(res, 'windows'));
app.get(['/download/mac', '/download/macos', '/downloads/mac', '/downloads/macos'],
  (_req, res) => redirectToAsset(res, 'macos'));
app.get(['/download/linux', '/downloads/linux'],
  (_req, res) => redirectToAsset(res, 'linux'));

// Version + per-OS installer byte size for the release the /download/<os>
// redirects resolve to, from the same cache (no extra GitHub call). The
// download cards render it under each button. no-store keeps Cloudflare from
// pinning it, matching the redirects. version/size are null until the API
// first answers, so the cards degrade to no caption.
app.get('/download/manifest', async (_req, res) => {
  const data = await resolveReleaseData();
  const sizeFor = (os) => data?.sizeByName?.[DOWNLOAD_ASSETS[os]] ?? null;
  res.set('Cache-Control', 'no-store');
  res.json({
    version: data?.version ?? null,
    assets: {
      windows: { size: sizeFor('windows') },
      macos: { size: sizeFor('macos') },
      linux: { size: sizeFor('linux') },
    },
  });
});

// Account pages and public profiles live on the Build portal; hand these
// paths over with the query intact. The emailed verify/recover landings
// (/auth/*) stay in this SPA.
const BUILD_ORIGIN = 'https://build.hellonexus.com';
app.get(['/login', '/register', '/recover', '/account', '/u', '/u/:username'], (req, res) => {
  // Only the path and query travel: an absolute-form request target would
  // otherwise be glued onto the origin as-is.
  const { pathname, search } = new URL(req.originalUrl, BUILD_ORIGIN);
  res.redirect(302, `${BUILD_ORIGIN}${pathname}${search}`);
});

// Host-routed root: my.hellonexus.com (and my.localhost for local prod
// preview - browsers resolve *.localhost to loopback) is the app surface and
// gets the SPA shell; every other host (hellonexus.com, www, the Railway
// internal domain, plain localhost) gets the marketing page. ONLY `/` is
// host-dependent - every deeper path (/r/pair, /panel/phone, /auth/*,
// /download*, .well-known) keeps serving identically on all hosts:
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
