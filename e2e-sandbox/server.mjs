// Builds the host harness (react@19) + the worker widget bundles (react@18), then
// serves them from one origin so the worker can import a widget bundle by absolute
// same-origin URL. Used as the Playwright webServer for the sandbox e2e.

import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, '..');
const harnessDir = join(here, 'harness');
const sdkDist = join(webRoot, 'sdk', 'dist');
// App widget.mjs bundles are built in place in the apps repo (apps/<id>/).
const appsDir = process.env.NEXUS_APPS_DIR
  ? join(process.env.NEXUS_APPS_DIR, 'apps')
  : join(webRoot, '..', 'nexus-widgets-sdk-panel', 'apps');
const PORT = Number(process.env.SANDBOX_PORT ?? 4317);

// Blessed composites (ui-worldclock/ui-clockface) render real native components
// that import CSS-module .scss. The app builds those via Vite; this esbuild
// harness has no scss loader, so stub each module to a className proxy
// (styles.foo -> "foo") — structure renders, full theming only shows in the app.
const scssStub = {
  name: 'scss-stub',
  setup(b) {
    b.onResolve({ filter: /\.scss$/ }, (a) => ({ path: a.path, namespace: 'scss-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'scss-stub' }, () => ({
      contents: 'export default new Proxy({}, { get: (_, k) => (typeof k === "string" ? k : "") });',
      loader: 'js',
    }));
  },
};

// lib/i18n uses Vite's import.meta.glob (no esbuild equivalent) at module top, so
// importing it transitively (richComponents -> ClockWorldView) breaks the esbuild
// harness build. Stub it: useTranslation echoes keys — enough for structure.
const i18nStub = {
  name: 'i18n-stub',
  setup(b) {
    b.onResolve({ filter: /lib\/i18n$/ }, () => ({ path: 'i18n', namespace: 'i18n-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'i18n-stub' }, () => ({
      contents: 'export const useTranslation = () => ({ t: (k) => k, lang: "en", setLang: () => {} });\n'
        + 'export const I18nProvider = ({ children }) => children;',
      loader: 'js',
    }));
  },
};

// 1. Build worker widget bundles (idempotent).
spawnSync(process.execPath, [join(webRoot, 'sdk', 'build.mjs')], { stdio: 'inherit' });

// 2. Build the host harness bundle (react@19 from the web app's node_modules).
await build({
  entryPoints: [join(harnessDir, 'app.tsx')],
  outfile: join(harnessDir, 'app.mjs'),
  bundle: true, format: 'esm', platform: 'browser', target: 'es2020',
  jsx: 'automatic', jsxImportSource: 'react', sourcemap: false,
  plugins: [scssStub, i18nStub],
  define: {
    'process.env.NODE_ENV': '"production"',
    // The SDK host (proxyClient) pulls in the app's service client, which reads
    // Vite's import.meta.env + build-time globals. Point it at this harness
    // origin so the worker's brokered fetch hits the mock /widgets-api/proxy.
    'import.meta.env': JSON.stringify({
      VITE_SERVICE_PROTOCOL: 'http:', VITE_SERVICE_HOST: 'localhost', VITE_SERVICE_PORT: String(PORT),
      DEV: false, PROD: true, MODE: 'production', BASE_URL: '/',
    }),
    __APP_VERSION__: '"harness"', __SERVICE_BUILD__: 'false', __DEV_TOOLS__: 'false',
  },
  logLevel: 'warning',
});

const MIME = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.map': 'application/json', '.css': 'text/css' };

// Canned upstream responses so the weather widget's brokered fetch works offline.
// Times are generated server-side (Node Date is fine here) so the hourly cutoff
// and "Today" labels line up with the test run.
function mockProxyBody(targetUrl) {
  if (targetUrl.includes('ipwho.is')) {
    return { success: true, latitude: 34.0522, longitude: -118.2437, city: 'Los Angeles', region: 'California', country: 'United States', country_code: 'US' };
  }
  if (targetUrl.includes('open-meteo')) {
    const now = new Date();
    const hours = Array.from({ length: 12 }, (_, i) => new Date(now.getTime() + i * 3600_000).toISOString().slice(0, 13) + ':00');
    const days = Array.from({ length: 5 }, (_, i) => new Date(now.getTime() + i * 86400_000).toISOString().slice(0, 10));
    return {
      current: { temperature_2m: 72, weather_code: 2, wind_speed_10m: 11, relative_humidity_2m: 54 },
      hourly: { time: hours, temperature_2m: [72, 73, 74, 75, 74, 72, 70, 68, 67, 66, 65, 64], weather_code: [2, 2, 1, 0, 0, 2, 3, 3, 61, 61, 3, 2] },
      daily: { time: days, weather_code: [2, 0, 61, 3, 1], temperature_2m_max: [78, 81, 69, 74, 80], temperature_2m_min: [60, 62, 57, 59, 61] },
    };
  }
  return {};
}

// Canned host-action results so the screentime widget's dispatch data path works.
function mockDispatchResult(action) {
  if (action === 'screentime.today') {
    return {
      focus: { name: 'Visual Studio Code', totalMs: 5_400_000, formatted: '1h 30m' },
      history: [
        { name: 'Visual Studio Code', totalMs: 5_400_000, formatted: '1h 30m', pctOfMax: 100 },
        { name: 'Google Chrome', totalMs: 3_600_000, formatted: '1h', pctOfMax: 67 },
        { name: 'Slack', totalMs: 1_800_000, formatted: '30m', pctOfMax: 33 },
        { name: 'Terminal', totalMs: 900_000, formatted: '15m', pctOfMax: 17 },
        { name: 'Spotify', totalMs: 600_000, formatted: '10m', pctOfMax: 11 },
        { name: 'Figma', totalMs: 300_000, formatted: '5m', pctOfMax: 6 },
      ],
      totalMs: 12_600_000, totalFormatted: '3h 30m', maxMs: 5_400_000, hasData: true,
    };
  }
  if (action === 'displays.list') {
    return {
      displays: [
        { id: 'DEL-U2720Q', name: 'Dell U2720Q', manufacturer: 'Dell', model: 'U2720Q', isInternal: false, brightnessControl: { supported: true, min: 0, max: 100, current: 75 } },
        { id: 'LG-27GP', name: 'LG 27GP950', manufacturer: 'LG', model: '27GP950', isInternal: false, brightnessControl: { supported: true, min: 0, max: 100, current: 40 } },
      ],
      hint: '',
    };
  }
  if (action === 'displays.setBrightness') return { id: '', brightness: 0, status: 'applied', error: '' };
  if (action === 'media.nowPlaying') {
    return {
      sourceAppName: 'Spotify',
      song: { title: 'Midnight City', artist: 'M83', album: 'Hurry Up, We’re Dreaming' },
      playback: { playing: true, positionMs: 64000, durationMs: 244000 },
      controls: { isPrevEnabled: true, isNextEnabled: true, isPlayEnabled: true, isPauseEnabled: true },
    };
  }
  if (action === 'media.transport' || action === 'media.setVolume') return { ok: true };
  return null;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

    if (req.method === 'POST' && url.pathname === '/widgets-api/proxy') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      let target = '';
      try { target = JSON.parse(raw).url ?? ''; } catch { /* ignore */ }
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, status: 200, statusText: 'OK', headers: {}, body: mockProxyBody(target) }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/widgets-api/dispatch') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      let action = '';
      try { action = JSON.parse(raw).action ?? ''; } catch { /* ignore */ }
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, result: mockDispatchResult(action) }));
      return;
    }

    let path = decodeURIComponent(url.pathname);
    if (path === '/' ) path = '/index.html';

    let file;
    if (path === '/sdk-runtime.mjs') {
      file = join(sdkDist, 'runtime', 'sdk-runtime.mjs');
    } else if (path.startsWith('/widgets/')) {
      // /widgets/<id>/widget.mjs -> the app's in-place build in the apps repo.
      file = join(appsDir, normalize(path.slice('/widgets/'.length)).replace(/^(\.\.[/\\])+/, ''));
    } else {
      file = join(harnessDir, normalize(path).replace(/^(\.\.[/\\])+/, ''));
    }
    if (!existsSync(file)) { res.writeHead(404); res.end('not found: ' + path); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch (err) {
    res.writeHead(500); res.end(String(err));
  }
});

server.listen(PORT, () => console.log(`sandbox harness on http://localhost:${PORT}`));
