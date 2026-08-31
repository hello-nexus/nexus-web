import { describe, expect, it } from 'vitest';
import { gpuNoticeKey } from './gpuNotice';

describe('gpuNoticeKey', () => {
  it('says nothing once a context exists', () => {
    expect(gpuNoticeKey('ready', true)).toBeNull();
  });

  it('separates a card that is still coming up from one that is missing', () => {
    // Both render black on the devices, but only one is the user's to fix.
    expect(gpuNoticeKey('initializing', false)).toBe('lighting.gpuInitializingNotice');
    expect(gpuNoticeKey('unavailable', false)).toBe('lighting.gpuUnavailableNotice');
  });

  it('falls back to the boolean when the service predates gpuState', () => {
    expect(gpuNoticeKey(undefined, false)).toBe('lighting.gpuUnavailableNotice');
    expect(gpuNoticeKey(undefined, true)).toBeNull();
    expect(gpuNoticeKey(undefined, undefined)).toBeNull();
  });
});
