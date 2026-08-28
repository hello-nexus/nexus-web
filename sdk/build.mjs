// Builds (1) the host-shared SDK runtime bundle ONCE, and (2) each app under the
// apps repo's apps/<id>/index.tsx as a LIGHT bundle (~5 KB) with react /
// react/jsx-runtime / @hellonexus/ui / @hellonexus/sdk externalized to thin shims
// that read globalThis.__nexusRuntime (populated by the shared runtime). An app
// therefore ships only the author's code; react-dom + remote-dom + the SDK are
// downloaded once and shared - exactly what a third-party author's build produces.
//
// The author SOURCE lives in the apps repo: apps/<id>/index.tsx, committed
// next to the built widgets/<id>/widget.mjs. The SDK runtime
// + the shared element contract still live in nexus-web (the host owns the
// vocabulary); this build aliases them. NEXUS_APPS_DIR overrides the apps-repo
// location (defaults to the sibling worktree).

import { build } from 'esbuild';
import { readdirSync, statSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const runtimeDir = join(root, 'runtime');
const outDir = join(root, 'dist');
// The apps repo. Each app is one unit: apps/<id>/ holds the author source
// (index.tsx), manifest.json, assets, AND the built widget.mjs - built in place.
const appsRepo = process.env.NEXUS_APPS_DIR || join(root, '..', '..', 'nexus-apps');
const appsDir = join(appsRepo, 'apps');

const alias = {
  '@hellonexus/ui': join(runtimeDir, 'ui.tsx'),
  '@hellonexus/sdk': join(runtimeDir, 'sdk.ts'),
};
const mjsBytes = (r) =>
  Math.round(Object.entries(r.metafile.outputs).filter(([k]) => k.endsWith('.mjs')).reduce((a, [, o]) => a + (o.bytes ?? 0), 0) / 1024);

// --- 1. Probe @hellonexus/ui + @hellonexus/sdk runtime exports (so the widget
//        shims re-export exactly what the real modules do - no hand-kept list). ---
async function probeExports(entry) {
  const r = await build({
    entryPoints: [entry], bundle: true, write: false, metafile: true,
    format: 'esm', jsx: 'automatic', jsxImportSource: 'react', alias, logLevel: 'silent',
  });
  const out = Object.values(r.metafile.outputs).find((o) => o.entryPoint);
  return (out?.exports ?? []).filter((n) => n !== 'default');
}
const uiExports = await probeExports(join(runtimeDir, 'ui.tsx'));
const sdkExports = await probeExports(join(runtimeDir, 'sdk.ts'));
// react / jsx-runtime surfaces are stable; hard-list them (the CJS react probe is
// unreliable). Authors mostly use @hellonexus/sdk hooks, but cover direct react use.
const REACT_EXPORTS = [
  'useState', 'useEffect', 'useContext', 'useReducer', 'useCallback', 'useMemo', 'useRef',
  'useImperativeHandle', 'useLayoutEffect', 'useDebugValue', 'useDeferredValue', 'useTransition',
  'useId', 'useSyncExternalStore', 'useInsertionEffect', 'createElement', 'cloneElement',
  'createContext', 'forwardRef', 'Fragment', 'memo', 'lazy', 'Suspense', 'StrictMode',
  'Children', 'isValidElement', 'createRef', 'Component', 'PureComponent', 'startTransition', 'version',
];
const JSX_EXPORTS = ['jsx', 'jsxs', 'jsxDEV', 'Fragment'];

const shim = (ns, names, withDefault) =>
  `const R = globalThis.__nexusRuntime.${ns};\n` +
  names.map((n) => `export const ${n} = R.${n};`).join('\n') +
  (withDefault ? `\nexport default R;` : '');

const SHIMS = {
  '@hellonexus/ui': () => shim('UI', uiExports),
  '@hellonexus/sdk': () => shim('SDK', sdkExports),
  'react/jsx-runtime': () => shim('JsxRuntime', JSX_EXPORTS),
  'react': () => shim('React', REACT_EXPORTS, true),
};
const shimPlugin = {
  name: 'nexus-runtime-shim',
  setup(b) {
    const filter = /^(@hellonexus\/(ui|sdk)|react|react\/jsx-runtime)$/;
    b.onResolve({ filter }, (a) => ({ path: a.path, namespace: 'nexus-shim' }));
    b.onLoad({ filter: /.*/, namespace: 'nexus-shim' }, (a) => ({ contents: (SHIMS[a.path] ?? (() => 'export {}'))(), loader: 'js' }));
  },
};

// --- 2. Build the shared runtime bundle (react-dom + remote-dom + ui + sdk, once). ---
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

// --- 3. Build each app LIGHT (source from the apps repo). ---
if (!existsSync(appsDir)) { console.error('apps dir not found at', appsDir, '(set NEXUS_APPS_DIR)'); process.exit(1); }
const ids = readdirSync(appsDir).filter((d) => {
  const p = join(appsDir, d);
  return statSync(p).isDirectory() && existsSync(join(p, 'index.tsx'));
});
if (ids.length === 0) { console.warn('no apps found under', appsDir); process.exit(0); }

const results = [];
for (const id of ids) {
  // Build the widget facet in place: apps/<id>/widget.mjs next to its source +
  // manifest. An app with a manifest.json is a shipped app; one without is an
  // example (built so authors can run it through the harness).
  const r = await build({
    entryPoints: [join(appsDir, id, 'index.tsx')],
    outfile: join(appsDir, id, 'widget.mjs'),
    bundle: true, format: 'esm', platform: 'browser', target: 'es2019',
    jsx: 'automatic', jsxImportSource: 'react', minify: true, sourcemap: true,
    plugins: [shimPlugin],
    define: { 'process.env.NODE_ENV': '"production"' }, metafile: true, logLevel: 'warning',
  });
  const app = existsSync(join(appsDir, id, 'manifest.json'));
  results.push({ id, kb: mjsBytes(r), app });
  console.log(`built ${id} → widget.mjs (${mjsBytes(r)} KB)${app ? '' : ' (example)'}`);
}

console.log('\nwidget.mjs sizes:');
for (const r of results) console.log(`  ${r.id.padEnd(32)} ${String(r.kb).padStart(3)} KB${r.app ? '' : '  (example)'}`);
