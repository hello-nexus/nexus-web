// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Drives the real author CLI against a throwaway app. The CLI imports esbuild
// from the sdk workspace or the host install; without either, there is nothing
// to run, so the suite skips rather than failing a checkout that never built the SDK.
const cli = fileURLToPath(new URL('../../../sdk/cli/nexus-app.mjs', import.meta.url));
const canRun = (() => {
  try { createRequire(cli).resolve('esbuild'); return true; } catch { return false; }
})();

let root = '';
let app = '';

const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

describe.skipIf(!canRun)('nexus-app build with a renderer', () => {
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'nexus-cli-'));
    app = join(root, 'app');
    mkdirSync(join(app, 'node_modules', 'fakepkg'), { recursive: true });
    mkdirSync(join(root, 'shared'), { recursive: true });
    writeFileSync(join(app, 'node_modules', 'fakepkg', 'index.js'), 'export const MARKER = "from-app-node-modules";\n');
    writeFileSync(join(app, 'node_modules', 'fakepkg', 'package.json'), '{"name":"fakepkg","type":"module","main":"index.js"}\n');
    // Lives outside the app dir: its package can only resolve through the app's node_modules.
    writeFileSync(join(root, 'shared', 'engine.ts'), "import { MARKER } from 'fakepkg';\nexport const engine = () => MARKER;\n");
    writeFileSync(join(app, 'index.tsx'), "import { mount } from '@hello-nexus/sdk';\nmount(() => null);\n");
    writeFileSync(join(app, 'renderer.ts'),
      "import { defineRenderer } from '@hello-nexus/sdk/renderer';\nimport { engine } from '../shared/engine';\n" +
      'defineRenderer((ctx) => { ctx.post(engine()); });\n');
    writeFileSync(join(app, 'manifest.json'), JSON.stringify({
      schema: 'nexus.app/1', id: 'com.test.cli', name: 'Cli', version: '0.1.0', renderers: ['renderer.mjs'],
    }));
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('bundles renderer.ts into a self-contained renderer.mjs', () => {
    const r = run('build', app);
    expect(r.status, r.stderr).toBe(0);
    const out = readFileSync(join(app, 'renderer.mjs'), 'utf8');
    expect(out).toContain('from-app-node-modules');
    expect(out).not.toMatch(/^\s*import[\s{]/m);
    expect(out).not.toContain('__nexusRuntime');
    expect(out).toContain('booted');
  });

  it('resolves a package installed in both places to the app copy, once', () => {
    const dup = join(root, 'dup');
    mkdirSync(join(dup, 'node_modules', 'twin'), { recursive: true });
    mkdirSync(join(root, 'node_modules', 'twin'), { recursive: true });
    mkdirSync(join(root, 'shared2'), { recursive: true });
    for (const [base, tag] of [[join(dup, 'node_modules', 'twin'), 'TWIN-APP-COPY'], [join(root, 'node_modules', 'twin'), 'TWIN-OUTER-COPY']] as const) {
      writeFileSync(join(base, 'index.js'), `export const TAG = "${tag}";\n`);
      writeFileSync(join(base, 'package.json'), '{"name":"twin","type":"module","main":"index.js"}\n');
    }
    writeFileSync(join(root, 'shared2', 'engine.ts'), "import { TAG } from 'twin';\nexport const engine = () => TAG;\n");
    writeFileSync(join(dup, 'index.tsx'), "import { mount } from '@hello-nexus/sdk';\nmount(() => null);\n");
    writeFileSync(join(dup, 'renderer.ts'),
      "import { defineRenderer } from '@hello-nexus/sdk/renderer';\nimport { TAG } from 'twin';\nimport { engine } from '../shared2/engine';\n" +
      'defineRenderer((ctx) => { ctx.post([TAG, engine()]); });\n');
    const r = run('build', dup);
    expect(r.status, r.stderr).toBe(0);
    const out = readFileSync(join(dup, 'renderer.mjs'), 'utf8');
    expect(out.match(/TWIN-APP-COPY/g)).toHaveLength(1);
    expect(out).not.toContain('TWIN-OUTER-COPY');
  });

  it('leaves the widget bundle on the runtime shim', () => {
    const widget = readFileSync(join(app, 'widget.mjs'), 'utf8');
    expect(widget).toContain('__nexusRuntime');
    expect(widget).not.toContain('booted');
  });

  it('produces no renderer.mjs for an app without a renderer source', () => {
    const plain = join(root, 'plain');
    mkdirSync(plain);
    writeFileSync(join(plain, 'index.tsx'), "import { mount } from '@hello-nexus/sdk';\nmount(() => null);\n");
    const r = run('build', plain);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(join(plain, 'renderer.mjs'))).toBe(false);
  });

  it('validate checks every manifest renderers entry', () => {
    expect(run('validate', app).status).toBe(0);
    const bad = join(root, 'bad');
    mkdirSync(bad);
    writeFileSync(join(bad, 'index.tsx'), 'export {}\n');
    writeFileSync(join(bad, 'manifest.json'), JSON.stringify({
      schema: 'nexus.app/1', id: 'com.test.bad', name: 'Bad', version: '0.1.0', renderers: ['missing.mjs', '../up.mjs'],
    }));
    const r = run('validate', bad);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('missing.mjs');
    expect(r.stderr).toContain('../up.mjs');
  });
});
