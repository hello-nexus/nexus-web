import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDeviceId } from './deviceId';

const KEY = 'nexus.deviceId';

describe('getDeviceId', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('generates and persists a device id on first use', () => {
    expect(localStorage.getItem(KEY)).toBeNull();
    const id = getDeviceId();
    expect(id).toBeTruthy();
    // Persisted under the documented key so a later read reuses it.
    expect(localStorage.getItem(KEY)).toBe(id);
  });

  it('returns the SAME id across calls (stable across pairings on the same origin)', () => {
    const first = getDeviceId();
    const second = getDeviceId();
    expect(second).toBe(first);
    // No new value was minted on the second call.
    expect(localStorage.getItem(KEY)).toBe(first);
  });

  it('reuses an already-persisted id', () => {
    localStorage.setItem(KEY, 'pre-existing-id');
    expect(getDeviceId()).toBe('pre-existing-id');
  });

  it('falls back to a UUID v4 when crypto.randomUUID is unavailable', () => {
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new TypeError('not a function');
    });
    const id = getDeviceId();
    // RFC 4122 v4 shape from the getRandomValues fallback.
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(localStorage.getItem(KEY)).toBe(id);
  });
});
