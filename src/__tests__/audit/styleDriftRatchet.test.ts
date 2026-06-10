import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Drift ratchet over the advisory style audits. The audits stay advisory for
 * humans (`npm run audit:styles`), but the finding counts must never grow:
 * new code uses the tokens/mixins from day one. When a migration pass lowers
 * a count, ratchet the baseline down to lock in the progress.
 */
const BASELINES = {
  styles: 850, // npm run audit:styles      - raw radius/shadow/alpha/blur/timing/type
  text: 470, // npm run audit:text-styles - raw font declarations outside _text.scss
};

const REPO_ROOT = join(__dirname, '..', '..', '..');

function findings(script: string, pattern: RegExp): number {
  const out = execFileSync('node', [join(REPO_ROOT, 'scripts', script)], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  const match = out.match(pattern);
  expect(match, `could not parse findings count from ${script} output`).toBeTruthy();
  return Number(match![1]);
}

describe('style drift ratchet', () => {
  it('audit:styles finding count does not grow', () => {
    const count = findings('audit-styles.mjs', /(\d+) total findings/);
    expect(
      count,
      count > BASELINES.styles
        ? `audit:styles findings grew ${BASELINES.styles} -> ${count}; use the --radius/--shadow/--alpha/--blur/--ease tokens and text mixins instead of raw values (run "npm run audit:styles" for the list)`
        : `findings dropped to ${count}; ratchet BASELINES.styles down to lock in the progress`,
    ).toBeLessThanOrEqual(BASELINES.styles);
    if (count < BASELINES.styles) {
      console.warn(`audit:styles findings dropped to ${count}; ratchet BASELINES.styles down to lock it in`);
    }
  });

  it('audit:text-styles finding count does not grow', () => {
    const count = findings('audit-text-styles.mjs', /(\d+) raw declarations/);
    expect(
      count,
      count > BASELINES.text
        ? `audit:text-styles findings grew ${BASELINES.text} -> ${count}; use the @include text-* mixins from _text.scss (run "npm run audit:text-styles" for the list)`
        : `findings dropped to ${count}; ratchet BASELINES.text down to lock in the progress`,
    ).toBeLessThanOrEqual(BASELINES.text);
    if (count < BASELINES.text) {
      console.warn(`audit:text-styles findings dropped to ${count}; ratchet BASELINES.text down to lock it in`);
    }
  });
});
