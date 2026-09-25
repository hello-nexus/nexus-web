import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLastRoute } from './useLastRoute';

const mockFetch = vi.fn();
const mockSave = vi.fn();

vi.mock('../api/session', () => ({
  fetchLastRoute: () => mockFetch(),
  saveLastRoute: (path: string, fullscreen?: boolean) => mockSave(path, fullscreen),
}));

function Harness({ path, enabled = true, fullscreen = false }: { path: string; enabled?: boolean; fullscreen?: boolean }) {
  useLastRoute(path, navigate, enabled, fullscreen, restoreFullscreen);
  return null;
}

const navigate = vi.fn();
const restoreFullscreen = vi.fn();

function stored(path: string, fullscreen = false) {
  return { path, fullscreen };
}

function setLocation(href: string) {
  window.history.replaceState(null, '', href);
}

function setRememberLastPage(remember: boolean) {
  localStorage.setItem('nexus_settings', JSON.stringify({ general: { rememberLastPage: remember } }));
}

beforeEach(() => {
  mockFetch.mockReset();
  mockSave.mockReset();
  navigate.mockReset();
  restoreFullscreen.mockReset();
  mockFetch.mockResolvedValue(stored(''));
  mockSave.mockResolvedValue(null);
  localStorage.clear();
  setLocation('/');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useLastRoute', () => {
  it('restores the stored route when the window opened bare', async () => {
    mockFetch.mockResolvedValue(stored('/system/monitoring/cpu'));

    await act(async () => { render(<Harness path="/system/dashboard" />); });

    expect(navigate).toHaveBeenCalledWith('system', 'monitoring', 'cpu');
  });

  it('leaves a deep-linked window where it was pointed', async () => {
    // A tray balloon opens /?openUpdate=1; restoring over it would lose the
    // destination the click asked for.
    setLocation('/?openUpdate=1');
    mockFetch.mockResolvedValue(stored('/system/monitoring/cpu'));

    await act(async () => { render(<Harness path="/system/dashboard" />); });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('ignores a stored value the router cannot express', async () => {
    mockFetch.mockResolvedValue(stored('/elsewhere/x'));

    await act(async () => { render(<Harness path="/system/dashboard" />); });

    expect(navigate).not.toHaveBeenCalled();
  });

  it('records each route change once the restore read has answered', async () => {
    const { rerender } = render(<Harness path="/system/dashboard" />);
    await act(async () => { rerender(<Harness path="/system/lighting" />); });

    expect(mockSave).toHaveBeenCalledWith('/system/lighting', false);
  });

  it('never saves before the restore read answers', async () => {
    // The default route the window opened on would otherwise overwrite the
    // stored one, and the service serves both requests concurrently.
    let resolveFetch: (v: ReturnType<typeof stored>) => void = () => {};
    mockFetch.mockReturnValue(new Promise(r => { resolveFetch = r; }));

    render(<Harness path="/system/dashboard" />);
    expect(mockSave).not.toHaveBeenCalled();

    await act(async () => { resolveFetch(stored('/system/monitoring/cpu')); });
    expect(navigate).toHaveBeenCalledWith('system', 'monitoring', 'cpu');
  });

  it('still saves when the restore read fails', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));

    await act(async () => { render(<Harness path="/system/lighting" />); });

    expect(mockSave).toHaveBeenCalledWith('/system/lighting', false);
  });

  it('restores through the token the desktop shell appends', async () => {
    // nexus-overlay opens the dashboard as "/?token=..." on every Windows tray
    // click; that is the shell's auth handoff, not a destination.
    setLocation('/?token=abc123');
    mockFetch.mockResolvedValue(stored('/system/monitoring/cpu'));

    await act(async () => { render(<Harness path="/system/dashboard" />); });

    expect(navigate).toHaveBeenCalledWith('system', 'monitoring', 'cpu');
  });

  it('still refuses a deep link that also carries a token', async () => {
    setLocation('/?token=abc123&openUpdate=1');
    mockFetch.mockResolvedValue(stored('/system/monitoring/cpu'));

    await act(async () => { render(<Harness path="/system/dashboard" />); });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('neither restores nor records while "Remember last page" is off', async () => {
    setRememberLastPage(false);
    mockFetch.mockResolvedValue(stored('/system/monitoring/cpu'));

    const { rerender } = render(<Harness path="/system/dashboard" />);
    await act(async () => { rerender(<Harness path="/system/lighting" />); });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('stops recording as soon as the setting is switched off mid-session', async () => {
    const { rerender } = render(<Harness path="/system/dashboard" />);
    await act(async () => { rerender(<Harness path="/system/lighting" />); });
    expect(mockSave).toHaveBeenCalledWith('/system/lighting', false);

    mockSave.mockClear();
    setRememberLastPage(false);
    await act(async () => { rerender(<Harness path="/system/cooling" />); });

    expect(mockSave).not.toHaveBeenCalled();
  });

  it('does not clobber the restored route with the path it landed on', async () => {
    // useRoute navigates inside startTransition, so `path` still holds the
    // landing route for one render after the restore resolves. Saving there
    // would overwrite the stored route with /system/dashboard - the reason a
    // window closed right after opening used to forget the page.
    mockFetch.mockResolvedValue(stored('/system/monitoring/cpu'));

    const { rerender } = render(<Harness path="/system/dashboard" />);
    await act(async () => { rerender(<Harness path="/system/dashboard" />); });
    expect(mockSave).not.toHaveBeenCalled();

    // The transition lands; recording resumes from there.
    await act(async () => { rerender(<Harness path="/system/monitoring/cpu" />); });
    expect(mockSave).toHaveBeenCalledWith('/system/monitoring/cpu', false);
  });

  it('records the landing route again once it is a real destination', async () => {
    mockFetch.mockResolvedValue(stored('/system/monitoring/cpu'));

    const { rerender } = render(<Harness path="/system/dashboard" />);
    await act(async () => { rerender(<Harness path="/system/monitoring/cpu" />); });
    mockSave.mockClear();
    // User navigates back to the page the window opened on - a real move now.
    await act(async () => { rerender(<Harness path="/system/dashboard" />); });

    expect(mockSave).toHaveBeenCalledWith('/system/dashboard', false);
  });

  it('gives up the restore once the user has navigated away', async () => {
    // enabled is false until the service answers, so a restore can resolve
    // seconds after the window opened - by then the click wins.
    let resolveFetch: (v: ReturnType<typeof stored>) => void = () => {};
    mockFetch.mockReturnValue(new Promise(r => { resolveFetch = r; }));

    const { rerender } = render(<Harness path="/system/dashboard" />);
    rerender(<Harness path="/system/cooling" />);
    await act(async () => { resolveFetch(stored('/system/monitoring/cpu')); });

    expect(navigate).not.toHaveBeenCalled();
    expect(mockSave).toHaveBeenCalledWith('/system/cooling', false);
  });

  it('restores fullscreen along with the route', async () => {
    mockFetch.mockResolvedValue(stored('/system/monitoring', true));

    await act(async () => { render(<Harness path="/system/dashboard" />); });

    expect(navigate).toHaveBeenCalledWith('system', 'monitoring', null);
    expect(restoreFullscreen).toHaveBeenCalledTimes(1);
  });

  it('leaves fullscreen off when the stored route was not in it', async () => {
    mockFetch.mockResolvedValue(stored('/system/monitoring'));

    await act(async () => { render(<Harness path="/system/dashboard" />); });

    expect(navigate).toHaveBeenCalledWith('system', 'monitoring', null);
    expect(restoreFullscreen).not.toHaveBeenCalled();
  });

  it('restores fullscreen when the window opened straight on the stored route', async () => {
    // The macOS service reopens a closed window on the stored route itself.
    setLocation('/system/monitoring');
    mockFetch.mockResolvedValue(stored('/system/monitoring', true));

    await act(async () => { render(<Harness path="/system/monitoring" />); });

    expect(navigate).not.toHaveBeenCalled();
    expect(restoreFullscreen).toHaveBeenCalledTimes(1);
  });

  it('keeps a window opened on another page out of fullscreen', async () => {
    // The macOS tray's "Open Settings" lands on /system/settings.
    setLocation('/system/settings');
    mockFetch.mockResolvedValue(stored('/system/monitoring', true));

    await act(async () => { render(<Harness path="/system/settings" />); });

    expect(navigate).not.toHaveBeenCalled();
    expect(restoreFullscreen).not.toHaveBeenCalled();
    expect(mockSave).toHaveBeenCalledWith('/system/settings', false);
  });

  it('records entering and leaving fullscreen on the same page', async () => {
    const { rerender } = render(<Harness path="/system/monitoring" />);
    await act(async () => { rerender(<Harness path="/system/monitoring" fullscreen />); });
    expect(mockSave).toHaveBeenLastCalledWith('/system/monitoring', true);

    await act(async () => { rerender(<Harness path="/system/monitoring" />); });
    expect(mockSave).toHaveBeenLastCalledWith('/system/monitoring', false);
  });

  it('sends saves one at a time so a quick toggle cannot land out of order', async () => {
    let resolveFirst: (v: null) => void = () => {};
    mockSave.mockReturnValueOnce(new Promise(r => { resolveFirst = r; }));

    const { rerender } = render(<Harness path="/system/monitoring" />);
    await act(async () => { rerender(<Harness path="/system/monitoring" fullscreen />); });
    await act(async () => { rerender(<Harness path="/system/monitoring" />); });
    expect(mockSave).toHaveBeenCalledTimes(1);

    await act(async () => { resolveFirst(null); });
    expect(mockSave).toHaveBeenCalledTimes(2);
    expect(mockSave).toHaveBeenLastCalledWith('/system/monitoring', false);
  });

  it('does not let a save that never settles hold back the next one', async () => {
    vi.useFakeTimers();
    mockSave.mockReturnValueOnce(new Promise(() => {}));

    const { rerender } = render(<Harness path="/system/monitoring" />);
    await act(async () => { rerender(<Harness path="/system/monitoring" fullscreen />); });
    await act(async () => { rerender(<Harness path="/system/monitoring" />); });
    expect(mockSave).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(mockSave).toHaveBeenCalledTimes(2);
    expect(mockSave).toHaveBeenLastCalledWith('/system/monitoring', false);
  });

  it('does nothing at all while the service is offline', async () => {
    await act(async () => { render(<Harness path="/system/dashboard" enabled={false} />); });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });
});
