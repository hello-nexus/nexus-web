import { describe, expect, it } from 'vitest';
import { resolveInteractive, webViewTapOpensImmersive } from './webViewConfig';

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

describe('webViewTapOpensImmersive', () => {
  it('does not open on a tap by default', () => {
    expect(webViewTapOpensImmersive({ type: 'web-view' })).toBe(false);
    expect(webViewTapOpensImmersive({ type: 'web-view', config: { url: 'https://a.test/' } })).toBe(false);
  });

  it('opens on a tap when the setting is off', () => {
    expect(webViewTapOpensImmersive({ type: 'web-view', config: { interactive: false } })).toBe(true);
  });

  it('leaves every other widget alone', () => {
    expect(webViewTapOpensImmersive({ type: 'clock' })).toBe(true);
    expect(webViewTapOpensImmersive({ type: 'clock', config: { interactive: true } })).toBe(true);
  });
});
