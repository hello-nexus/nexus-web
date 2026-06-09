#!/usr/bin/env node
// `nexus-app` — the author CLI for sandboxed Nexus apps. It formalises the build
// the host uses internally (sdk/build.mjs) for an OUTSIDE author who installs the
// published @hello-nexus/sdk package:
//
//   nexus-app new <dir>        scaffold a starter app (index.tsx + manifest.json + config)
//   nexus-app build [dir]      bundle index.tsx -> widget.mjs (LIGHT; the host provides the runtime)
//   nexus-app validate [dir]   check the manifest + entry are well-formed
//
// `build` externalises react / react/jsx-runtime / @hello-nexus/sdk / @hello-nexus/sdk/ui
// to thin shims that read globalThis.__nexusRuntime (populated once by the host-shared
// runtime), so an app ships only the author's code (~few KB) — react-dom + remote-dom +
// the SDK are downloaded once and shared. The shim re-exports exactly what the runtime
// exports (probed, never a hand-kept list).
//
// Runtime source for the shims: the installed @hello-nexus/sdk if resolvable from the app
// dir, else the in-tree sdk/runtime (this repo's dev checkout). Override with NEXUS_SDK_RUNTIME
// (a dir containing sdk.ts/ui.tsx or an installed package's dist).

import { build, context } from 'esbuild';
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)); // sdk/cli
const IN_TREE_RUNTIME = join(HERE, '..', 'runtime'); // sdk/runtime (dev fallback)

const REACT_EXPORTS = [
  'useState', 'useEffect', 'useContext', 'useReducer', 'useCallback', 'useMemo', 'useRef',
  'useImperativeHandle', 'useLayoutEffect', 'useDebugValue', 'useDeferredValue', 'useTransition',
  'useId', 'useSyncExternalStore', 'useInsertionEffect', 'createElement', 'cloneElement',
  'createContext', 'forwardRef', 'Fragment', 'memo', 'lazy', 'Suspense', 'StrictMode',
  'Children', 'isValidElement', 'createRef', 'Component', 'PureComponent', 'startTransition', 'version',
];
const JSX_EXPORTS = ['jsx', 'jsxs', 'jsxDEV', 'Fragment'];

const die = (msg) => { console.error(`error: ${msg}`); process.exit(1); };
const abs = (p) => (isAbsolute(p) ? p : resolve(process.cwd(), p));

// --- resolve the runtime entries used as the shim re-export source ---------------------
function resolveRuntime(appDir) {
  if (process.env.NEXUS_SDK_RUNTIME) {
    const d = abs(process.env.NEXUS_SDK_RUNTIME);
    const sdk = ['sdk.ts', 'index.js'].map((f) => join(d, f)).find(existsSync);
    const ui = ['ui.tsx', 'ui.js'].map((f) => join(d, f)).find(existsSync);
    if (sdk && ui) return { sdk, ui, where: d };
  }
  // Installed package (third-party author).
  const pkg = join(appDir, 'node_modules', '@hello-nexus', 'sdk');
  if (existsSync(pkg)) {
    const sdk = join(pkg, 'dist', 'index.js'), ui = join(pkg, 'dist', 'ui.js');
    if (existsSync(sdk) && existsSync(ui)) return { sdk, ui, where: pkg };
  }
  return { sdk: join(IN_TREE_RUNTIME, 'sdk.ts'), ui: join(IN_TREE_RUNTIME, 'ui.tsx'), where: IN_TREE_RUNTIME };
}

async function probeExports(entry) {
  const r = await build({
    entryPoints: [entry], bundle: true, write: false, metafile: true,
    format: 'esm', jsx: 'automatic', jsxImportSource: 'react', logLevel: 'silent',
    // The in-tree ui.tsx imports the contract relatively; that resolves on its own.
  });
  const out = Object.values(r.metafile.outputs).find((o) => o.entryPoint);
  return (out?.exports ?? []).filter((n) => n !== 'default');
}

const shimSrc = (ns, names, withDefault) =>
  `const R = globalThis.__nexusRuntime.${ns};\n` +
  names.map((n) => `export const ${n} = R.${n};`).join('\n') +
  (withDefault ? `\nexport default R;` : '');

function shimPlugin(sdkExports, uiExports) {
  const SHIMS = {
    '@hello-nexus/sdk': () => shimSrc('SDK', sdkExports),
    '@hello-nexus/sdk/ui': () => shimSrc('UI', uiExports),
    'react/jsx-runtime': () => shimSrc('JsxRuntime', JSX_EXPORTS),
    'react': () => shimSrc('React', REACT_EXPORTS, true),
  };
  const filter = /^(@hello-nexus\/sdk(\/ui)?|react|react\/jsx-runtime)$/;
  return {
    name: 'nexus-runtime-shim',
    setup(b) {
      b.onResolve({ filter }, (a) => ({ path: a.path, namespace: 'nexus-shim' }));
      b.onLoad({ filter: /.*/, namespace: 'nexus-shim' }, (a) => ({ contents: (SHIMS[a.path] ?? (() => 'export {}'))(), loader: 'js' }));
    },
  };
}

// --- commands --------------------------------------------------------------------------
// Shared esbuild config: bundle index.tsx -> widget.mjs, externalising react /
// @hello-nexus/* to the host runtime shims. dev => unminified + NODE_ENV development.
async function buildSpec(appDir, opts) {
  const dir = abs(appDir);
  const entry = join(dir, 'index.tsx');
  if (!existsSync(entry)) die(`no index.tsx in ${dir} (run \`nexus-app new\` first)`);
  const rt = resolveRuntime(dir);
  const [sdkExports, uiExports] = await Promise.all([probeExports(rt.sdk), probeExports(rt.ui)]);
  return {
    rt,
    options: {
      entryPoints: [entry], outfile: join(dir, 'widget.mjs'),
      bundle: true, format: 'esm', platform: 'browser', target: 'es2019',
      jsx: 'automatic', jsxImportSource: 'react', minify: !opts.dev, sourcemap: !!opts.sourcemap,
      plugins: [shimPlugin(sdkExports, uiExports)],
      define: { 'process.env.NODE_ENV': opts.dev ? '"development"' : '"production"' },
      metafile: true, logLevel: 'warning',
    },
  };
}

async function cmdBuild(appDir, opts) {
  const { rt, options } = await buildSpec(appDir, opts);
  const r = await build(options);
  const kb = Math.round((Object.values(r.metafile.outputs).find((o) => o.entryPoint)?.bytes ?? 0) / 1024 * 10) / 10;
  console.log(`built ${appDir}/widget.mjs (${kb} KB)  [runtime: ${rt.where}]`);
}

async function cmdDev(appDir, opts) {
  const { rt, options } = await buildSpec(appDir, { ...opts, dev: true });
  const ctx = await context(options);
  await ctx.rebuild();
  await ctx.watch();
  console.log(`watching ${appDir}/index.tsx -> widget.mjs (dev, unminified)  [runtime: ${rt.where}]\nCtrl-C to stop.`);
  await new Promise(() => {}); // keep alive until interrupted
}

// nexus.app/1 capability keys: array allowlists vs boolean flags vs the code model.
const ARRAY_CAPS = new Set(['net.fetch', 'sensors.read', 'dispatch']);
const BOOL_CAPS = new Set(['rgb.read', 'rgb.write', 'config']);

function cmdValidate(appDir) {
  const dir = abs(appDir);
  const errors = [], warns = [];
  if (!existsSync(join(dir, 'index.tsx'))) errors.push('missing index.tsx');
  const mPath = join(dir, 'manifest.json');
  if (!existsSync(mPath)) {
    errors.push('missing manifest.json');
  } else {
    let m;
    try { m = JSON.parse(readFileSync(mPath, 'utf8')); }
    catch (e) { errors.push(`manifest.json is not valid JSON: ${e.message}`); }
    if (m) {
      if (m.schema !== 'nexus.app/1') warns.push('manifest.schema should be "nexus.app/1"');
      if (typeof m.id !== 'string' || !/^[a-z0-9.-]+\.[a-z0-9.-]+$/i.test(m.id)) errors.push('manifest.id must be a reverse-DNS string (e.g. com.you.myapp)');
      if (typeof m.name !== 'string' || !m.name) errors.push('manifest.name is required');
      if (typeof m.version !== 'string' || !/^\d+\.\d+\.\d+/.test(m.version)) errors.push('manifest.version must be semver (e.g. 0.1.0)');
      if (m.runtime != null && m.runtime !== 'sdk') warns.push('manifest.runtime should be "sdk"');
      if (m.page != null && typeof m.page !== 'boolean') errors.push('manifest.page must be a boolean');
      if (m.capabilities != null) {
        if (typeof m.capabilities !== 'object' || Array.isArray(m.capabilities)) errors.push('manifest.capabilities must be an object');
        else for (const [k, v] of Object.entries(m.capabilities)) {
          if (ARRAY_CAPS.has(k)) {
            if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) errors.push(`capability "${k}" must be a string array`);
          } else if (BOOL_CAPS.has(k)) {
            if (typeof v !== 'boolean') errors.push(`capability "${k}" must be a boolean`);
          } else if (k === 'code') {
            if (v !== 'worker') warns.push('capability "code" is usually "worker"');
          } else {
            warns.push(`unknown capability "${k}"`);
          }
        }
      }
    }
  }
  for (const w of warns) console.warn(`warn: ${w}`);
  if (errors.length) { for (const e of errors) console.error(`error: ${e}`); process.exit(1); }
  console.log(`ok: ${appDir} validates${warns.length ? ` (${warns.length} warning${warns.length > 1 ? 's' : ''})` : ''}`);
}

function cmdNew(appDir) {
  const dir = abs(appDir);
  if (existsSync(dir) && readdirSync(dir).length) die(`${dir} exists and is not empty`);
  mkdirSync(dir, { recursive: true });
  const id = appDir.split(/[\\/]/).pop().replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  for (const [name, content] of Object.entries(TEMPLATES(id))) {
    const target = join(dir, name);
    mkdirSync(dirname(target), { recursive: true }); // nested (e.g. assets/icon.svg)
    writeFileSync(target, content);
  }
  console.log(`scaffolded ${appDir}/`);
  console.log('  next:  cd ' + appDir + ' && npm install && npx nexus-app build .');
}

const TEMPLATES = (id) => ({
  'index.tsx': `import { mount, useLocalState } from '@hello-nexus/sdk';
import { Stack, Text, Card, Gauge, Color, Curve, Spinner } from '@hello-nexus/sdk/ui';

// A starter app exercising the SDK's interactive components. Real React, no JSON;
// it runs in a sandboxed worker and the host renders blessed, panel-themed components.
function App() {
  const [s, set] = useLocalState({
    color: '#ff8800',
    busy: false,
    points: [{ x: 30, y: 20 }, { x: 60, y: 55 }, { x: 90, y: 100 }],
  });
  const duty = s.points[s.points.length - 1].y;
  return (
    <Stack direction="column" gap={10} padding={12} grow>
      <Text value="Hello from the SDK" weight="bold" />
      <Gauge value={duty} min={0} max={100} label={\`\${Math.round(duty)}%\`} sublabel="duty" tone="accent" />
      <Color value={s.color} onChange={(hex) => set({ color: hex })} />
      <Curve points={s.points} xmin={20} xmax={100} ymin={0} ymax={100} onChange={(pts) => set({ points: pts })} />
      <Card interactive title="Hold me" onPress={() => set({ busy: true })} onLongPress={() => set({ busy: false })}>
        {s.busy ? <Spinner /> : <Text value="tap = busy, hold = stop" tone="text-dim" size={12} />}
      </Card>
    </Stack>
  );
}

mount(App);
`,
  'manifest.json': JSON.stringify({
    schema: 'nexus.app/1',
    id: `com.example.${id}`,
    name: id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    version: '0.1.0',
    description: 'A Nexus SDK app.',
    author: { name: '', url: '' },
    icon: 'assets/icon.svg',
    min_nexus_version: '0.42.0',
    runtime: 'sdk',
    page: false,
    surfaces: ['dashboard'],
    sizes: ['4x2', '4x4'],
    default_size: '4x2',
    // Capabilities the host grants. Arrays are allowlists (empty = none); the
    // rgb.*/config flags are booleans; code is the execution model. The
    // authoritative grant set is the signed cert; the manifest must be a subset.
    capabilities: {
      'sensors.read': [], 'rgb.read': false, 'rgb.write': false,
      'net.fetch': [], config: false, code: 'worker', dispatch: [],
    },
  }, null, 2) + '\n',
  'package.json': JSON.stringify({
    name: id,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: { build: 'nexus-app build .', validate: 'nexus-app validate .' },
    dependencies: { '@hello-nexus/sdk': '^0.1.0' },
    devDependencies: { react: '^18.3.0', typescript: '^5.5.0' },
  }, null, 2) + '\n',
  'tsconfig.json': JSON.stringify({
    compilerOptions: {
      target: 'ES2020', module: 'ESNext', moduleResolution: 'Bundler',
      jsx: 'react-jsx', jsxImportSource: 'react',
      strict: true, noEmit: true, skipLibCheck: true, types: [],
    },
    include: ['index.tsx'],
  }, null, 2) + '\n',
  '.npmrc': `# @hello-nexus is hosted on GitHub Packages (private). A read:packages token is required.
@hello-nexus:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=\${GITHUB_TOKEN}
`,
  'assets/icon.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>\n`,
  '.gitignore': 'node_modules\nwidget.mjs\nwidget.mjs.map\n',
  'README.md': `# ${id}

A sandboxed Nexus SDK app.

\`\`\`sh
npm install            # needs a GitHub Packages read:packages token (see .npmrc)
npx nexus-app build .  # -> widget.mjs (the shipped bundle)
npx nexus-app validate .
\`\`\`

Edit \`index.tsx\` (real React against \`@hello-nexus/sdk\` + \`@hello-nexus/sdk/ui\`) and
\`manifest.json\` (id / name / version / capabilities). The host provides the shared
runtime, so \`widget.mjs\` ships only your code.
`,
});

// --- arg parsing -----------------------------------------------------------------------
const [cmd, ...rest] = process.argv.slice(2);
const positional = rest.filter((a) => !a.startsWith('-'));
const flags = new Set(rest.filter((a) => a.startsWith('-')));
const dirArg = positional[0] ?? '.';

switch (cmd) {
  case 'new':
    if (!positional[0]) die('usage: nexus-app new <dir>');
    cmdNew(positional[0]);
    break;
  case 'build':
    await cmdBuild(dirArg, { dev: flags.has('--dev'), sourcemap: flags.has('--sourcemap') });
    break;
  case 'dev':
    await cmdDev(dirArg, { sourcemap: flags.has('--sourcemap') });
    break;
  case 'validate':
    cmdValidate(dirArg);
    break;
  default:
    console.log('nexus-app — Nexus SDK app CLI\n\n  new <dir>        scaffold a starter app\n  build [dir]      bundle index.tsx -> widget.mjs  (--dev, --sourcemap)\n  dev [dir]        rebuild widget.mjs on change (unminified)\n  validate [dir]   check manifest + entry against nexus.app/1');
    if (cmd && cmd !== '--help' && cmd !== '-h') process.exit(1);
}
