import { describe, expect, it } from 'vitest';
import { resolveAllowMedia, resolveInteractive } from './webViewConfig';

describe('resolveInteractive', () => {
  it('defaults on for an instance with no stored value', () => {
    expect(resolveInteractive(undefined)).toBe(true);
    expect(resolveInteractive(null)).toBe(true);
  });

  it('is off only when stored as false', () => {
    expect(resolveInteractive(false)).toBe(false);
    expect(resolveInteractive(true)).toBe(true);
  });
});

describe('resolveAllowMedia', () => {
  it('defaults off for an instance with no stored value or a malformed one', () => {
    expect(resolveAllowMedia(undefined)).toBe(false);
    expect(resolveAllowMedia(null)).toBe(false);
    expect(resolveAllowMedia('true')).toBe(false);
    expect(resolveAllowMedia(1)).toBe(false);
  });

  it('is on only when stored as true', () => {
    expect(resolveAllowMedia(true)).toBe(true);
    expect(resolveAllowMedia(false)).toBe(false);
  });
});
