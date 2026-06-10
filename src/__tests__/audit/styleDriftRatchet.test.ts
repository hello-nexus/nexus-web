import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Drift ratchet over the advisory style audits. The audits stay advisory for
 * humans (`npm run audit:styles`), but the finding counts must never grow:
 * new code uses the tokens/mixins from day one. When a migration pass lowers
 * a count, ratchet the baseline down to lock in the progress.
 */
const RATCHETS = [
  {
    script: 'audit-styles.mjs',
    pattern: /(\d+) total findings/,
    baseline: 854,
    hint: 'use the --radius/--shadow/--alpha/--blur/--ease tokens and text mixins instead of raw values (run "npm run audit:styles" for the list)',
  },
  {
    script: 'audit-text-styles.mjs',
    pattern: /(\d+) raw declarations/,
    baseline: 474,
    hint: 'use the @include text-* mixins or var(--type-*/--weight-*) tokens from _text.scss (run "npm run audit:text-styles" for the list)',
  },
] as const;

const REPO_ROOT = join(__dirname, '..', '..', '..');

function findings(script: string, pattern: RegExp): number {
  const out = execFileSync('node', [join(REPO_ROOT, 'scripts', script)], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  // A fully migrated axis prints an "OK" line and no count.
  if (/^OK {2}/m.test(out)) return 0;
  const match = out.match(pattern);
  expect(match, `could not parse findings count from ${script} output`).toBeTruthy();
  return Number(match![1]);
}

describe('style drift ratchet', () => {
  it.each(RATCHETS.map(r => [r.script, r] as const))('%s finding count does not grow', (_name, ratchet) => {
    const count = findings(ratchet.script, ratchet.pattern);
    expect(
      count,
      `${ratchet.script} findings grew ${ratchet.baseline} -> ${count}; ${ratchet.hint}`,
    ).toBeLessThanOrEqual(ratchet.baseline);
    if (count < ratchet.baseline) {
      console.warn(`${ratchet.script} findings dropped to ${count}; ratchet the baseline down to lock it in`);
    }
  });
});
