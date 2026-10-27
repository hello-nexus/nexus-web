// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The resize frame does calc(var(--panel-card-radius) + <length>); a unitless 0 makes that calc invalid
// and collapses every grab handle to nothing.
describe('--panel-card-radius', () => {
  it('is never set to a unitless zero', () => {
    const scss = readFileSync(join(__dirname, '..', 'PanelApp.module.scss'), 'utf8');
    expect(scss).not.toMatch(/--panel-card-radius:\s*0\s*;/);
  });
});
