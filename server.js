import express from 'express';
import compression from 'compression';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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

// Public installer download redirects. The actual binaries live in
// nexusqos/qos-releases (a separate public repo); these routes 302 to
// GitHub's `latest/download/<asset>` alias so the URLs we hand out from
// nexusqos.com / marketing material never need to change when we cut a
// new version. `Cache-Control: no-store` prevents Cloudflare (in front of
// nexusqos.com) from pinning a stale Location header if the asset map is
// edited - the binary itself is on GitHub and out of scope here.
//
// Linux is intentionally absent: there's no Linux build published yet, so
// Linux UAs and any /download/linux hit fall through to the SPA, which
// shows the chooser with a "coming soon" affordance instead of a 404.
const RELEASES_BASE = 'https://github.com/nexusqos/qos-releases/releases/latest/download';
const DOWNLOAD_ASSETS = {
  windows: 'Qos-Setup.exe',
  macos: 'Qos.dmg',
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

app.use(express.static(join(__dirname, 'dist'), { maxAge: '1d' }));
// Express 5 / send v1+ requires an explicit `root` option for sendFile,
// otherwise absolute paths come back with a NotFoundError even when the
// file exists. The SPA catchall was returning 404 for every deep link
// (e.g. /my-computer/devices) without it.
app.get('/{*path}', (_req, res) => res.sendFile('index.html', { root: join(__dirname, 'dist') }));

app.listen(port, () => console.log(`qos-web on port ${port}`));
