// Builds each sample widget under widgets/<id>/index.tsx into a self-contained
// sandboxed worker ESM bundle (react@18 + @remote-dom + the SDK, all inlined),
// isolated from the host app's react@19. This is exactly what a third-party
// author's build produces; we dogfood the same pipeline.

import { build } from 'esbuild';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const widgetsDir = join(root, 'widgets');
const outDir = join(root, 'dist');

const alias = {
  '@hellonexus/ui': join(root, 'runtime/ui.tsx'),
  '@hellonexus/sdk': join(root, 'runtime/sdk.ts'),
};

const ids = readdirSync(widgetsDir).filter((d) => {
  const p = join(widgetsDir, d);
  return statSync(p).isDirectory() && existsSync(join(p, 'index.tsx'));
});

if (ids.length === 0) {
  console.warn('no widgets found under', widgetsDir);
  process.exit(0);
}

const results = [];
for (const id of ids) {
  const out = join(outDir, id, 'widget.mjs');
  const result = await build({
    entryPoints: [join(widgetsDir, id, 'index.tsx')],
    outfile: out,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2019',
    jsx: 'automatic',
    jsxImportSource: 'react',
    minify: true,
    sourcemap: true,
    alias,
    metafile: true,
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning',
  });
  const bytes = Object.values(result.metafile.outputs).reduce((a, o) => a + (o.bytes ?? 0), 0);
  results.push({ id, kb: Math.round(bytes / 1024) });
  console.log(`built ${id} → ${out} (${Math.round(bytes / 1024)} KB)`);
}

console.log('\nbundle sizes:');
for (const r of results) console.log(`  ${r.id.padEnd(28)} ${r.kb} KB`);
