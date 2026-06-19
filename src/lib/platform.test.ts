import { describe, it, expect, vi, afterEach } from 'vitest';

// isApplePlatform memoizes on first call, so each case re-imports the module
// with a fresh navigator stub to cover the Apple and non-Apple cases.
function stubUA(userAgent: string) {
  vi.stubGlobal('navigator', { userAgent } as Navigator);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('isMultiSelectModifier', () => {
  it('uses Cmd (metaKey) on macOS, where Ctrl+click is a right-click', async () => {
    stubUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605');
    const { isMultiSelectModifier } = await import('./platform');
    expect(isMultiSelectModifier({ metaKey: true, ctrlKey: false })).toBe(true);
    expect(isMultiSelectModifier({ metaKey: false, ctrlKey: true })).toBe(false);
  });

  it('uses Ctrl on Windows', async () => {
    stubUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120');
    const { isMultiSelectModifier } = await import('./platform');
    expect(isMultiSelectModifier({ metaKey: false, ctrlKey: true })).toBe(true);
    expect(isMultiSelectModifier({ metaKey: true, ctrlKey: false })).toBe(false);
  });

  it('uses Ctrl on Linux', async () => {
    stubUA('Mozilla/5.0 (X11; Linux x86_64) Chrome/120');
    const { isMultiSelectModifier } = await import('./platform');
    expect(isMultiSelectModifier({ metaKey: false, ctrlKey: true })).toBe(true);
    expect(isMultiSelectModifier({ metaKey: true, ctrlKey: false })).toBe(false);
  });

  it('uses Cmd on iPad (Apple, hardware keyboard)', async () => {
    stubUA('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Safari/604');
    const { isMultiSelectModifier } = await import('./platform');
    expect(isMultiSelectModifier({ metaKey: true, ctrlKey: false })).toBe(true);
  });
});
