import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLastRoute } from './useLastRoute';

const mockFetch = vi.fn();
const mockSave = vi.fn();

vi.mock('../api/session', () => ({
  fetchLastRoute: () => mockFetch(),
  saveLastRoute: (path: string) => mockSave(path),
}));

function Harness({ path, enabled = true }: { path: string; enabled?: boolean }) {
  useLastRoute(path, navigate, enabled);
  return null;
}

const navigate = vi.fn();

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
  mockFetch.mockResolvedValue('');
  mockSave.mockResolvedValue(null);
  localStorage.clear();
  setLocation('/');
});

describe('useLastRoute', () => {
  it('restores the stored route when the window opened bare', async () => {
    mockFetch.mockResolvedValue('/system/monitoring/cpu');

    await act(async () => { render(<Harness path="/system/dashboard" />); });

    expect(navigate).toHaveBeenCalledWith('system', 'monitoring', 'cpu');
  });

  it('leaves a deep-linked window where it was pointed', async () => {
    // A tray balloon opens /?openUpdate=1; restoring over it would lose the
    // destination the click asked for.
    setLocation('/?openUpdate=1');
    mockFetch.mockResolvedValue('/system/monitoring/cpu');

    await act(async () => { render(<Harness path="/system/dashboard" />); });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('ignores a stored value the router cannot express', async () => {
    mockFetch.mockResolvedValue('/elsewhere/x');

    await act(async () => { render(<Harness path="/system/dashboard" />); });

    expect(navigate).not.toHaveBeenCalled();
  });

  it('records each route change once the restore read has answered', async () => {
    const { rerender } = render(<Harness path="/system/dashboard" />);
    await act(async () => { rerender(<Harness path="/system/lighting" />); });

    expect(mockSave).toHaveBeenCalledWith('/system/lighting');
  });

  it('never saves before the restore read answers', async () => {
    // The default route the window opened on would otherwise overwrite the
    // stored one, and the service serves both requests concurrently.
    let resolveFetch: (v: string) => void = () => {};
    mockFetch.mockReturnValue(new Promise<string>(r => { resolveFetch = r; }));

    render(<Harness path="/system/dashboard" />);
    expect(mockSave).not.toHaveBeenCalled();

    await act(async () => { resolveFetch('/system/monitoring/cpu'); });
    expect(navigate).toHaveBeenCalledWith('system', 'monitoring', 'cpu');
  });

  it('still saves when the restore read fails', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));

    await act(async () => { render(<Harness path="/system/lighting" />); });

    expect(mockSave).toHaveBeenCalledWith('/system/lighting');
  });

  it('restores through the token the desktop shell appends', async () => {
    // nexus-overlay opens the dashboard as "/?token=..." on every Windows tray
    // click; that is the shell's auth handoff, not a destination.
    setLocation('/?token=abc123');
    mockFetch.mockResolvedValue('/system/monitoring/cpu');

    await act(async () => { render(<Harness path="/system/dashboard" />); });

    expect(navigate).toHaveBeenCalledWith('system', 'monitoring', 'cpu');
  });

  it('still refuses a deep link that also carries a token', async () => {
    setLocation('/?token=abc123&openUpdate=1');
    mockFetch.mockResolvedValue('/system/monitoring/cpu');

    await act(async () => { render(<Harness path="/system/dashboard" />); });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('neither restores nor records while "Remember last page" is off', async () => {
    setRememberLastPage(false);
    mockFetch.mockResolvedValue('/system/monitoring/cpu');

    const { rerender } = render(<Harness path="/system/dashboard" />);
    await act(async () => { rerender(<Harness path="/system/lighting" />); });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('stops recording as soon as the setting is switched off mid-session', async () => {
    const { rerender } = render(<Harness path="/system/dashboard" />);
    await act(async () => { rerender(<Harness path="/system/lighting" />); });
    expect(mockSave).toHaveBeenCalledWith('/system/lighting');

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
    mockFetch.mockResolvedValue('/system/monitoring/cpu');

    const { rerender } = render(<Harness path="/system/dashboard" />);
    await act(async () => { rerender(<Harness path="/system/dashboard" />); });
    expect(mockSave).not.toHaveBeenCalled();

    // The transition lands; recording resumes from there.
    await act(async () => { rerender(<Harness path="/system/monitoring/cpu" />); });
    expect(mockSave).toHaveBeenCalledWith('/system/monitoring/cpu');
  });

  it('records the landing route again once it is a real destination', async () => {
    mockFetch.mockResolvedValue('/system/monitoring/cpu');

    const { rerender } = render(<Harness path="/system/dashboard" />);
    await act(async () => { rerender(<Harness path="/system/monitoring/cpu" />); });
    mockSave.mockClear();
    // User navigates back to the page the window opened on - a real move now.
    await act(async () => { rerender(<Harness path="/system/dashboard" />); });

    expect(mockSave).toHaveBeenCalledWith('/system/dashboard');
  });

  it('gives up the restore once the user has navigated away', async () => {
    // enabled is false until the service answers, so a restore can resolve
    // seconds after the window opened - by then the click wins.
    let resolveFetch: (v: string) => void = () => {};
    mockFetch.mockReturnValue(new Promise<string>(r => { resolveFetch = r; }));

    const { rerender } = render(<Harness path="/system/dashboard" />);
    rerender(<Harness path="/system/cooling" />);
    await act(async () => { resolveFetch('/system/monitoring/cpu'); });

    expect(navigate).not.toHaveBeenCalled();
    expect(mockSave).toHaveBeenCalledWith('/system/cooling');
  });

  it('does nothing at all while the service is offline', async () => {
    await act(async () => { render(<Harness path="/system/dashboard" enabled={false} />); });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });
});
