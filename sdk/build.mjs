// Builds the host-shared SDK runtime bundle that every app loads once at
// /sdk-runtime.mjs. The output is committed at public/sdk-runtime.mjs, so run
// this after changing anything under runtime/.
//
// Apps are NOT built here: each lives in its own repo and builds through
// sdk/cli (nexus-app build), which resolves the published @hello-nexus/sdk.

import { build } from 'esbuild';
import { existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const runtimeDir = join(root, 'runtime');
const outDir = join(root, 'dist');
const alias = {
  '@hellonexus/ui': join(runtimeDir, 'ui.tsx'),
  '@hellonexus/sdk': join(runtimeDir, 'sdk.ts'),
};
const mjsBytes = (r) =>
  Math.round(Object.entries(r.metafile.outputs).filter(([k]) => k.endsWith('.mjs')).reduce((a, [, o]) => a + (o.bytes ?? 0), 0) / 1024);

// Build the shared runtime bundle (react-dom + remote-dom + ui + sdk, once).
const rt = await build({
  entryPoints: [join(runtimeDir, 'runtimeEntry.ts')],
  outfile: join(outDir, 'runtime', 'sdk-runtime.mjs'),
  bundle: true, format: 'esm', platform: 'browser', target: 'es2019',
  jsx: 'automatic', jsxImportSource: 'react', minify: true, sourcemap: true,
  alias, define: { 'process.env.NODE_ENV': '"production"' }, metafile: true, logLevel: 'warning',
});
console.log(`built shared runtime → dist/runtime/sdk-runtime.mjs (${mjsBytes(rt)} KB)`);
// Stage the runtime into the web's public/ so `vite build` ships it to wwwroot
// at /sdk-runtime.mjs (the host fetches it once, relay-aware). Phase 5 relocates
// this into the apps dir + a service route when the build moves to the apps repo.
const pub = join(root, '..', 'public');
if (existsSync(pub)) {
  copyFileSync(join(outDir, 'runtime', 'sdk-runtime.mjs'), join(pub, 'sdk-runtime.mjs'));
  console.log('staged runtime → public/sdk-runtime.mjs');
}
