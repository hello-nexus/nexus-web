import { describe, expect, it } from 'vitest';
import { resolveSidebarCompact } from './sidebarCompact';

describe('resolveSidebarCompact', () => {
  it('is compact when narrow, whatever the override', () => {
    expect(resolveSidebarCompact(null, true)).toBe(true);
    expect(resolveSidebarCompact(true, true)).toBe(true);
    expect(resolveSidebarCompact(false, true)).toBe(true);
  });

  it('follows the manual override at wide widths', () => {
    expect(resolveSidebarCompact(null, false)).toBe(false);
    expect(resolveSidebarCompact(true, false)).toBe(true);
    expect(resolveSidebarCompact(false, false)).toBe(false);
  });
});
