import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// audit-locales is already strict (exit 1 on key drift vs en.json) but only
// ran manually. Running it under vitest puts locale parity behind the same
// blocking CI gate as everything else.
describe('locale parity', () => {
  it('all locale files carry exactly the en.json key set', () => {
    const repoRoot = join(__dirname, '..', '..', '..');
    expect(() =>
      execFileSync('node', [join(repoRoot, 'scripts', 'audit-locales.mjs')], {
        cwd: repoRoot,
        encoding: 'utf8',
      }),
    ).not.toThrow();
  });
});
