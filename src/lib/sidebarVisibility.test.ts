import { describe, expect, it } from 'vitest';
import { canHideFromSidebar, isListedInSidebar, withSidebarHidden } from './sidebarVisibility';

const off = { key: 'curated-a', supportsNexusControl: true, nexusControlEnabled: false };
const on = { ...off, nexusControlEnabled: true };
const unsupported = { ...off, supportsNexusControl: false };

describe('sidebar visibility rule', () => {
  it('omits a hidden device while its Nexus Control is off', () => {
    expect(isListedInSidebar(off, ['curated-a'])).toBe(false);
  });

  it('lists a hidden device once Nexus Control is on', () => {
    expect(isListedInSidebar(on, ['curated-a'])).toBe(true);
  });

  it('lists a control-off device that is not hidden', () => {
    expect(isListedInSidebar(off, ['curated-b'])).toBe(true);
  });

  it('lists a device that never supports Nexus Control even when its key is hidden', () => {
    expect(isListedInSidebar(unsupported, ['curated-a'])).toBe(true);
  });

  it('offers hiding only for a control-off device', () => {
    expect(canHideFromSidebar(off)).toBe(true);
    expect(canHideFromSidebar(on)).toBe(false);
    expect(canHideFromSidebar(unsupported)).toBe(false);
  });

  it('adds and removes a key without duplicating or mutating', () => {
    const base = ['x'];
    expect(withSidebarHidden(base, 'a', true)).toEqual(['x', 'a']);
    expect(withSidebarHidden(['x', 'a'], 'a', false)).toEqual(['x']);
    expect(withSidebarHidden(['x', 'a'], 'a', true)).toEqual(['x', 'a']);
    expect(withSidebarHidden(base, 'a', false)).toBe(base);
    expect(base).toEqual(['x']);
  });
});
