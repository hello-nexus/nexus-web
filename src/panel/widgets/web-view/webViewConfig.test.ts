import { describe, expect, it } from 'vitest';
import { resolveInteractive } from './webViewConfig';

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
