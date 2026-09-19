import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeckRecentAppsSection } from './DeckRecentAppsSection';

const mockUseRecentApps = vi.fn();
vi.mock('./useRecentApps', () => ({ useRecentApps: (enabled: boolean) => mockUseRecentApps(enabled) }));

const mockFetchService = vi.fn();
vi.mock('../../../api/service', () => ({ fetchService: (path: string) => mockFetchService(path) }));

vi.mock('../common/AppPicker', () => ({
  AppPicker: ({ onSelect }: { onSelect: (app: { id: string; name: string; processName?: string }) => void }) => (
    <button type="button" onClick={() => onSelect({ id: 'proc:chrome', name: 'Chrome', processName: 'chrome' })}>
      pick-chrome
    </button>
  ),
}));

function baseResult(over: Partial<ReturnType<typeof mockUseRecentApps>> = {}) {
  return {
    apps: [],
    focusedProcessKey: undefined,
    excluded: [],
    loaded: true,
    setExcluded: vi.fn(),
    clear: vi.fn(),
    activate: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  mockUseRecentApps.mockReset();
  mockUseRecentApps.mockReturnValue(baseResult());
  mockFetchService.mockReset();
  mockFetchService.mockResolvedValue({ shortcuts: [] });
});

describe('DeckRecentAppsSection - excluded chips', () => {
  it('renders no chips when nothing is excluded', () => {
    render(<DeckRecentAppsSection showPreviewNote={false} />);
    expect(screen.queryByRole('button', { pressed: true })).toBeNull();
  });

  it('renders a chip per excluded processKey', () => {
    mockUseRecentApps.mockReturnValue(baseResult({ excluded: ['discord', 'chrome'] }));
    render(<DeckRecentAppsSection showPreviewNote={false} />);
    expect(screen.getByText('discord')).toBeInTheDocument();
    expect(screen.getByText('chrome')).toBeInTheDocument();
  });

  it('clicking a chip removes it from the excluded list', () => {
    const setExcluded = vi.fn();
    mockUseRecentApps.mockReturnValue(baseResult({ excluded: ['discord', 'chrome'], setExcluded }));
    render(<DeckRecentAppsSection showPreviewNote={false} />);
    fireEvent.click(screen.getByText('discord'));
    expect(setExcluded).toHaveBeenCalledWith(['chrome']);
  });

  it('adding an app via the picker appends its processName to the excluded list', () => {
    const setExcluded = vi.fn();
    mockUseRecentApps.mockReturnValue(baseResult({ excluded: ['discord'], setExcluded }));
    render(<DeckRecentAppsSection showPreviewNote={false} />);
    fireEvent.click(screen.getByText('panel.settings.deck.recentApps.addExcluded'));
    fireEvent.click(screen.getByText('pick-chrome'));
    expect(setExcluded).toHaveBeenCalledWith(['discord', 'chrome']);
  });
});

describe('DeckRecentAppsSection - excluded chip display names survive a reopen', () => {
  it('resolves a name from the installed shortcuts list when the ring no longer carries it', async () => {
    mockFetchService.mockResolvedValue({ shortcuts: [{ name: 'Discord', processName: 'discord' }] });
    mockUseRecentApps.mockReturnValue(baseResult({ excluded: ['discord'] }));
    render(<DeckRecentAppsSection showPreviewNote={false} />);

    await waitFor(() => expect(screen.getByText('Discord')).toBeInTheDocument());
    expect(screen.queryByText('discord')).toBeNull();
  });

  it('prefers the live ring name over the shortcuts list', async () => {
    mockFetchService.mockResolvedValue({ shortcuts: [{ name: 'Old Name', processName: 'discord' }] });
    mockUseRecentApps.mockReturnValue(baseResult({
      excluded: ['discord'],
      apps: [{ processKey: 'discord', name: 'Discord (running)', lastFocusedUtcMs: 0 }],
    }));
    render(<DeckRecentAppsSection showPreviewNote={false} />);

    await waitFor(() => expect(screen.getByText('Discord (running)')).toBeInTheDocument());
  });

  it('falls back to the raw process key when no name resolves anywhere', () => {
    mockUseRecentApps.mockReturnValue(baseResult({ excluded: ['mystery-app'] }));
    render(<DeckRecentAppsSection showPreviewNote={false} />);
    expect(screen.getByText('mystery-app')).toBeInTheDocument();
  });
});

describe('DeckRecentAppsSection - desktopActions=false (a paired panel: PUT excluded / DELETE recent-apps are LocalhostOnly)', () => {
  it('hides Add excluded and Clear, and disables the excluded chips', () => {
    mockUseRecentApps.mockReturnValue(baseResult({ excluded: ['discord'] }));
    render(<DeckRecentAppsSection showPreviewNote={false} desktopActions={false} />);

    expect(screen.queryByText('panel.settings.deck.recentApps.addExcluded')).toBeNull();
    expect(screen.queryByText('panel.settings.deck.recentApps.clear')).toBeNull();
    expect(screen.getByText('discord').closest('button')).toBeDisabled();
  });
});

describe('DeckRecentAppsSection - clear recent', () => {
  it('confirms before clearing', () => {
    const clear = vi.fn();
    mockUseRecentApps.mockReturnValue(baseResult({ clear }));
    render(<DeckRecentAppsSection showPreviewNote={false} />);
    fireEvent.click(screen.getByText('panel.settings.deck.recentApps.clear'));
    expect(clear).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('confirm.ok'));
    expect(clear).toHaveBeenCalledTimes(1);
  });
});

describe('DeckRecentAppsSection - preview note', () => {
  it('shows the preview note only when asked to', () => {
    const { rerender } = render(<DeckRecentAppsSection showPreviewNote={false} />);
    expect(screen.queryByText('panel.settings.deck.recentApps.previewNote')).toBeNull();

    rerender(<DeckRecentAppsSection showPreviewNote />);
    expect(screen.getByText('panel.settings.deck.recentApps.previewNote')).toBeInTheDocument();
  });
});
