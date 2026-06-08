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
const PORT = Number(process.env.SANDBOX_PORT ?? 4317);

// 1. Build worker widget bundles (idempotent).
spawnSync(process.execPath, [join(webRoot, 'sdk', 'build.mjs')], { stdio: 'inherit' });

// 2. Build the host harness bundle (react@19 from the web app's node_modules).
await build({
  entryPoints: [join(harnessDir, 'app.tsx')],
  outfile: join(harnessDir, 'app.mjs'),
  bundle: true, format: 'esm', platform: 'browser', target: 'es2020',
  jsx: 'automatic', jsxImportSource: 'react', sourcemap: false,
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});

const MIME = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.map': 'application/json', '.css': 'text/css' };

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    let path = decodeURIComponent(url.pathname);
    if (path === '/' ) path = '/index.html';

    let file;
    if (path.startsWith('/widgets/')) {
      file = join(sdkDist, normalize(path.slice('/widgets/'.length)).replace(/^(\.\.[/\\])+/, ''));
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
