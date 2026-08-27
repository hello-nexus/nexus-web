// @vitest-environment node
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
    baseline: 726,
    hint: 'use the --radius/--shadow/--alpha/--blur/--ease tokens and text mixins instead of raw values (run "npm run audit:styles" for the list)',
  },
  {
    // Blur is fully migrated, so it is pinned at 0 rather than left to hide
    // under the total's slack.
    script: 'audit-styles.mjs',
    args: ['--axis=blur'],
    label: 'audit-styles.mjs --axis=blur',
    pattern: /(\d+) total findings/,
    baseline: 0,
    hint: 'use --blur-backdrop / --blur-chip / --blur-defocus, and never hand-write -webkit-backdrop-filter (lightningcss autoprefixes the unprefixed property; writing the prefix makes it DROP the unprefixed one, which renders nothing on Blink)',
  },
  {
    script: 'audit-text-styles.mjs',
    pattern: /(\d+) raw declarations/,
    // Panel monitoring gauges carry their value/label type inline: the value
    // font-size is the sanctioned em tier (per _text.scss), and line-height /
    // letter-spacing match every existing gauge. New gauge designs add more of
    // that same idiom, so the cap tracks up with them (the Fill gauge added 4).
    // The calendar widget's date/day/month display fonts are the same em-tier
    // idiom (like the clock).
    baseline: 502,
    hint: 'use the @include text-* mixins or var(--type-*/--weight-*) tokens from _text.scss (run "npm run audit:text-styles" for the list)',
  },
] as const;

const REPO_ROOT = join(__dirname, '..', '..', '..');

function findings(script: string, pattern: RegExp, args: readonly string[] = []): number {
  const out = execFileSync('node', [join(REPO_ROOT, 'scripts', script), ...args], {
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
  it.each(RATCHETS.map(r => [('label' in r ? r.label : r.script), r] as const))('%s finding count does not grow', (label, ratchet) => {
    const count = findings(ratchet.script, ratchet.pattern, 'args' in ratchet ? ratchet.args : []);
    expect(
      count,
      `${label} findings grew ${ratchet.baseline} -> ${count}; ${ratchet.hint}`,
    ).toBeLessThanOrEqual(ratchet.baseline);
    if (count < ratchet.baseline) {
      console.warn(`${label} findings dropped to ${count}; ratchet the baseline down to lock it in`);
    }
  });
});
