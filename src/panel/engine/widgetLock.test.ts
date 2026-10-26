// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolveWidgetsLocked } from './widgetLock';

describe('resolveWidgetsLocked', () => {
  it('uses the record flag when it is set', () => {
    expect(resolveWidgetsLocked(true, [{}])).toBe(true);
    expect(resolveWidgetsLocked(false, [{ locked: true }, { locked: true }])).toBe(false);
  });

  it('falls back to every widget having carried the old per-widget lock', () => {
    expect(resolveWidgetsLocked(undefined, [{ locked: true }, { locked: true }])).toBe(true);
    expect(resolveWidgetsLocked(null, [{ locked: true }, {}])).toBe(false);
  });

  it('is unlocked for an empty panel', () => {
    expect(resolveWidgetsLocked(undefined, [])).toBe(false);
  });
});
