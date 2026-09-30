// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Drift guard: every settings deep-link `anchor` declared in the search registry
// must have a matching `anchorId` stamped on a control in the Settings UI, and
// vice-versa. The two live in different files linked only by the id string, so
// this keeps a rename on one side from silently breaking the scroll-to target.

const read = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');

const registryAnchors = () => {
  const src = read('./providers.tsx');
  return [...src.matchAll(/anchor:\s*'([^']+)'/g)].map((m) => m[1]).sort();
};

// Every Settings view file (Account included), so a new section cannot slip
// an anchor past this guard by living in a file the list forgot.
const settingsFiles = (dir: string): string[] =>
  readdirSync(join(__dirname, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return settingsFiles(rel);
    return e.name.endsWith('.tsx') && !e.name.includes('.test.') ? [rel] : [];
  });

const uiAnchorIds = () => {
  const found = new Set<string>();
  for (const f of settingsFiles('../components/views/SettingsView')) {
    for (const m of read(f).matchAll(/anchorId="([^"]+)"/g)) found.add(m[1]);
  }
  return [...found].sort();
};

describe('settings deep-link anchor parity', () => {
  it('declares at least the seven settings anchors', () => {
    expect(registryAnchors().length).toBeGreaterThanOrEqual(7);
  });

  it('every registry anchor has a matching control anchorId', () => {
    const ui = new Set(uiAnchorIds());
    for (const a of registryAnchors()) expect(ui.has(a)).toBe(true);
  });

  it('every control anchorId is referenced by the registry', () => {
    const reg = new Set(registryAnchors());
    for (const a of uiAnchorIds()) expect(reg.has(a)).toBe(true);
  });
});
