import { describe, expect, it } from 'vitest';
import { gpuNotice } from './gpuNotice';

describe('gpuNotice', () => {
  it('says nothing once a context exists', () => {
    expect(gpuNotice('ready', true)).toBeNull();
  });

  it('separates a card that is still coming up from one that is missing', () => {
    // Both render black on the devices; only one is the user's to fix.
    expect(gpuNotice('initializing', false)).toEqual({ key: 'lighting.gpuInitializingNotice', tone: 'wait' });
    expect(gpuNotice('unavailable', false)).toEqual({ key: 'lighting.gpuUnavailableNotice', tone: 'fault' });
  });

  it('falls back to the boolean when the service predates gpuState', () => {
    expect(gpuNotice(undefined, false)?.key).toBe('lighting.gpuUnavailableNotice');
    expect(gpuNotice(undefined, true)).toBeNull();
    expect(gpuNotice(undefined, undefined)).toBeNull();
  });
});
