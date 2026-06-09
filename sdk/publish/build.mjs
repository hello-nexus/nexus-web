// Builds the publishable @hello-nexus/sdk package from the in-tree SDK source.
// Two entries — `.` (sdk.ts: mount + hooks + format) and `./ui` (ui.tsx: the
// component set) — with code-splitting so the shared element registration
// (elements.ts) + the contract become ONE shared chunk (a single
// customElements registration, never doubled). react / react-dom / @remote-dom
// / @quilted are externalized (the host runtime provides them; an app bundle
// externalizes @hello-nexus/* to it). No source maps ship (the tarball is
// dist/ only, so the original TS never leaves the private repo).

import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url)); // sdk/publish
const runtime = join(here, '..', 'runtime');          // sdk/runtime
const contract = join(here, '..', '..', 'src', 'sandbox', 'contract', 'elements.ts');
const outDir = join(here, 'dist');

rmSync(outDir, { recursive: true, force: true });

const external = [
  'react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom',
  '@remote-dom/core', '@remote-dom/core/elements', '@remote-dom/react',
  '@quilted/threads',
];

// --- 1. JS bundles (no deps needed: everything non-relative is external) ---
const r = await build({
  entryPoints: { index: join(runtime, 'sdk.ts'), ui: join(runtime, 'ui.tsx') },
  outdir: outDir,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  splitting: true,
  jsx: 'automatic',
  jsxImportSource: 'react',
  external,
  sourcemap: false,
  metafile: true,
  logLevel: 'warning',
});
const outs = Object.keys(r.metafile.outputs).map((o) => o.replace(here + '/', ''));
console.log('JS outputs:', outs.join(', '));

// --- 2. .d.ts via tsc (rootDir = nexus-web root so sdk/runtime + the contract
//        keep their relative structure and the cross-dir import resolves). ---
const dtsTsconfig = join(here, 'tsconfig.dts.json');
try {
  execFileSync(process.execPath, [
    join(here, '..', 'node_modules', 'typescript', 'bin', 'tsc'),
    '-p', dtsTsconfig,
  ], { stdio: 'inherit', cwd: here });
  console.log('emitted .d.ts -> dist/types/');
} catch (e) {
  console.error('tsc .d.ts emit failed:', e.message);
  process.exit(1);
}

// --- 3. Stage README into the package dir so it ships + renders. ---
const readme = join(here, 'README.md');
if (!existsSync(readme)) console.warn('no README.md in sdk/publish (it should ship)');

console.log('package build complete.');
