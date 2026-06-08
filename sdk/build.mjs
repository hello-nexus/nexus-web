// Builds (1) the host-shared SDK runtime bundle ONCE, and (2) each widget under
// widgets/<id>/index.tsx as a LIGHT bundle (~5 KB) with react / react/jsx-runtime
// / @hellonexus/ui / @hellonexus/sdk externalized to thin shims that read
// globalThis.__nexusRuntime (populated by the shared runtime). A widget therefore
// ships only the author's code; react-dom + remote-dom + the SDK are downloaded
// once and shared. This is exactly what a third-party author's build produces.

import { build } from 'esbuild';
import { readdirSync, statSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const widgetsDir = join(root, 'widgets');
const runtimeDir = join(root, 'runtime');
const outDir = join(root, 'dist');

const alias = {
  '@hellonexus/ui': join(runtimeDir, 'ui.tsx'),
  '@hellonexus/sdk': join(runtimeDir, 'sdk.ts'),
};
const mjsBytes = (r) =>
  Math.round(Object.entries(r.metafile.outputs).filter(([k]) => k.endsWith('.mjs')).reduce((a, [, o]) => a + (o.bytes ?? 0), 0) / 1024);

// --- 1. Probe @hellonexus/ui + @hellonexus/sdk runtime exports (so the widget
//        shims re-export exactly what the real modules do — no hand-kept list). ---
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
// this into the apps dir + a service route when the build moves to nexus-apps.
const pub = join(root, '..', 'public');
if (existsSync(pub)) {
  copyFileSync(join(outDir, 'runtime', 'sdk-runtime.mjs'), join(pub, 'sdk-runtime.mjs'));
  console.log('staged runtime → public/sdk-runtime.mjs');
}

// --- 3. Build each widget LIGHT. ---
const ids = readdirSync(widgetsDir).filter((d) => {
  const p = join(widgetsDir, d);
  return statSync(p).isDirectory() && existsSync(join(p, 'index.tsx'));
});
if (ids.length === 0) { console.warn('no widgets found under', widgetsDir); process.exit(0); }

const results = [];
for (const id of ids) {
  const r = await build({
    entryPoints: [join(widgetsDir, id, 'index.tsx')],
    outfile: join(outDir, id, 'widget.mjs'),
    bundle: true, format: 'esm', platform: 'browser', target: 'es2019',
    jsx: 'automatic', jsxImportSource: 'react', minify: true, sourcemap: true,
    plugins: [shimPlugin],
    define: { 'process.env.NODE_ENV': '"production"' }, metafile: true, logLevel: 'warning',
  });
  results.push({ id, kb: mjsBytes(r) });
  console.log(`built ${id} → widget.mjs (${mjsBytes(r)} KB)`);
}

console.log('\nbundle sizes (widget.mjs only):');
for (const r of results) console.log(`  ${r.id.padEnd(28)} ${r.kb} KB`);
