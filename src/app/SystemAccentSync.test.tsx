import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SystemAccentSync } from './SystemAccentSync';

// Drive the component in isolation: a mocked useUiSettings whose `settings` the
// test mutates to model a profile switch, and a mocked host bridge whose accent
// push the test fires by hand. vi.hoisted keeps the holder reachable from the
// hoisted vi.mock factories.
const h = vi.hoisted(() => ({
  update: vi.fn(),
  settings: { accentSource: 'system' as 'system' | 'custom', accentColor: '#0000ff' },
  accentCb: null as null | ((hex: string) => void),
  requestSystemAccent: vi.fn(),
}));

vi.mock('../hooks/useUiSettings', () => ({
  useUiSettings: () => ({ settings: h.settings, update: h.update }),
}));
vi.mock('./windowActions', () => ({
  requestSystemAccent: h.requestSystemAccent,
  subscribeSystemAccent: (cb: (hex: string) => void) => {
    h.accentCb = cb;
    return () => { h.accentCb = null; };
  },
}));

afterEach(() => {
  vi.clearAllMocks();
  h.settings = { accentSource: 'system', accentColor: '#0000ff' };
  h.accentCb = null;
});

describe('SystemAccentSync', () => {
  // Regression: a profile saved under a red OS accent stores accentColor=red.
  // After the OS accent changes to blue (under another profile), switching back
  // reloads the stale red. The OS accent must win — the component re-asserts it
  // because its effect now also depends on settings.accentColor, not just the
  // (profile-invariant) accentSource.
  it('re-applies the live OS accent when a profile switch reloads a stale stored accent', () => {
    // Profile B is active and already synced to the live OS accent (blue).
    h.settings = { accentSource: 'system', accentColor: '#0000ff' };
    const { rerender } = render(<SystemAccentSync />);

    // Host pushes the current OS accent (blue) — already matches, no write.
    act(() => h.accentCb!('#0000ff'));
    expect(h.update).not.toHaveBeenCalled();

    // Switch back to Profile A: reload() applies its stored accentColor (red,
    // frozen from when the OS accent was red).
    h.settings = { accentSource: 'system', accentColor: '#ff0000' };
    rerender(<SystemAccentSync />);

    // The fix: the live OS accent (blue) overrides the reloaded stale red.
    expect(h.update).toHaveBeenCalledWith({ accentColor: '#0000ff' });
    expect(h.update).toHaveBeenCalledTimes(1);

    // The real update() folds accentColor back into settings; once it matches
    // the OS accent the effect must go quiet — no re-entrant write / render loop.
    h.settings = { accentSource: 'system', accentColor: '#0000ff' };
    rerender(<SystemAccentSync />);
    expect(h.update).toHaveBeenCalledTimes(1);
  });

  it('does not write when the reloaded accent already matches the OS accent', () => {
    h.settings = { accentSource: 'system', accentColor: '#0000ff' };
    const { rerender } = render(<SystemAccentSync />);
    act(() => h.accentCb!('#0000ff'));

    // Switching to a profile whose stored accent is already the OS accent.
    h.settings = { accentSource: 'system', accentColor: '#0000ff' };
    rerender(<SystemAccentSync />);

    expect(h.update).not.toHaveBeenCalled();
  });

  it('leaves a custom accent untouched on profile switch', () => {
    h.settings = { accentSource: 'custom', accentColor: '#112233' };
    const { rerender } = render(<SystemAccentSync />);
    act(() => h.accentCb!('#0000ff'));

    h.settings = { accentSource: 'custom', accentColor: '#445566' };
    rerender(<SystemAccentSync />);

    expect(h.update).not.toHaveBeenCalled();
  });
});
