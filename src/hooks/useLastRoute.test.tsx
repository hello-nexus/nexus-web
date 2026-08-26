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

beforeEach(() => {
  mockFetch.mockReset();
  mockSave.mockReset();
  navigate.mockReset();
  mockFetch.mockResolvedValue('');
  mockSave.mockResolvedValue(null);
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

  it('does nothing at all while the service is offline', async () => {
    await act(async () => { render(<Harness path="/system/dashboard" enabled={false} />); });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });
});
