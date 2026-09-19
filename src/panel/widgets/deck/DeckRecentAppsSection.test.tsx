import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeckRecentAppsSection } from './DeckRecentAppsSection';

const mockUseRecentApps = vi.fn();
vi.mock('./useRecentApps', () => ({ useRecentApps: (enabled: boolean) => mockUseRecentApps(enabled) }));

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
