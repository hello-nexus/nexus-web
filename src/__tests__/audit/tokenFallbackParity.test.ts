import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Every `var(--token, #hex)` fallback must equal the token's canonical (dark
 * :root) value. Fallbacks only fire when the token sheet is absent, so a
 * drifted fallback is an invisible booby trap: retune a token in
 * variables.scss and the fallback silently keeps painting the old color.
 * ~35 sites had drifted before this gate existed.
 */
const REPO_ROOT = join(__dirname, '..', '..', '..');

function expandHex(hex: string): string {
  const h = hex.toLowerCase();
  return h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
}

// :root token values from variables.scss (dark theme - the canonical block
// before the [data-theme="light"] overrides), plus one level of --panel-*
// aliases from tokens.scss.
function canonicalTokens(): Map<string, string> {
  const tokens = new Map<string, string>();
  const variables = readFileSync(join(REPO_ROOT, 'src/styles/variables.scss'), 'utf8')
    .split('[data-theme')[0];
  for (const m of variables.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    tokens.set(m[1], expandHex(m[2]));
  }
  const panel = readFileSync(join(REPO_ROOT, 'src/panel/styles/tokens.scss'), 'utf8');
  for (const m of panel.matchAll(/(--panel-[\w-]+)\s*:\s*var\((--[\w-]+)\)\s*;/g)) {
    const resolved = tokens.get(m[2]);
    if (resolved) tokens.set(m[1], resolved);
  }
  return tokens;
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(scss|tsx|ts)$/.test(entry)) yield full;
  }
}

describe('token fallback parity', () => {
  it('every var(--token, #hex) fallback matches the canonical token value', () => {
    const tokens = canonicalTokens();
    const bad: string[] = [];
    for (const file of walk(join(REPO_ROOT, 'src'))) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/var\((--[\w-]+)\s*,\s*(#[0-9a-fA-F]{3,8})\)/g)) {
        const canonical = tokens.get(m[1]);
        if (!canonical) continue; // runtime-only or non-hex token
        if (expandHex(m[2]) !== canonical) {
          const line = text.slice(0, m.index).split('\n').length;
          bad.push(`${relative(REPO_ROOT, file)}:${line}  ${m[0]} (canonical ${canonical})`);
        }
      }
    }
    expect(bad, `fallback value drifted from the token it shadows:\n${bad.join('\n')}`).toEqual([]);
  });
});
