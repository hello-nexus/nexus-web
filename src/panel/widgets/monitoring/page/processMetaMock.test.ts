// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mockProcessMeta } from './processMetaMock';

describe('mockProcessMeta', () => {
  it('classifies a recognized foreground app with a plausible signed publisher', () => {
    const meta = mockProcessMeta('chrome.exe');
    expect(meta?.isApp).toBe(true);
    expect(meta?.publisher).toBe('Google LLC');
    expect(meta?.signed).toBe('signed');
  });

  it('classifies a recognized background process as isApp:false', () => {
    const meta = mockProcessMeta('explorer.exe');
    expect(meta?.isApp).toBe(false);
  });

  it('includes at least one unsigned entry with no publisher (round 5 item 6 fixture)', () => {
    const meta = mockProcessMeta('sketchy-tool.exe');
    expect(meta?.signed).toBe('unsigned');
    expect(meta?.publisher).toBeNull();
  });

  it('returns undefined for an unrecognized name - the graceful production fallback', () => {
    expect(mockProcessMeta('some-random-proc.exe')).toBeUndefined();
  });

  it('is deterministic across repeated calls', () => {
    expect(mockProcessMeta('chrome.exe')).toEqual(mockProcessMeta('chrome.exe'));
  });
});
