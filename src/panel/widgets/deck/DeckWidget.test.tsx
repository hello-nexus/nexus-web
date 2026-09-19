import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const executeDeckAction = vi.fn();
vi.mock('./deckExecutor', async importOriginal => {
  const actual = await importOriginal<typeof import('./deckExecutor')>();
  // isPrivilegedDeckAction is pure (no REST side effect) - keep the real
  // implementation so the widget's own privilege routing is exercised;
  // executeDeckAction is the one REST-side-effecting call under test.
  return { ...actual, executeDeckAction: (...a: unknown[]) => executeDeckAction(...a) };
});
vi.mock('./useDeckState', () => ({ useDeckLiveState: () => ({ isOn: () => undefined }) }));
vi.mock('../common/AppPicker', () => ({ useAppIcon: () => null, AppPicker: () => null }));
vi.mock('../../../hooks/useProcessIcon', () => ({ useProcessIcon: () => null }));

const mockUseDeckInstance = vi.fn();
vi.mock('./useDeckInstance', () => ({ useDeckInstance: (...args: unknown[]) => mockUseDeckInstance(...args) }));

const mockUseRecentApps = vi.fn();
vi.mock('./useRecentApps', () => ({ useRecentApps: (enabled: boolean) => mockUseRecentApps(enabled) }));

import { DeckWidget } from './DeckWidget';
import { innerGridForSize } from './deckLayout';
import type { PanelWidget } from '../../types';
import type { DeckPage } from './types';

function widget(size: PanelWidget['size'] = '2x2'): PanelWidget {
  return { id: 'w1', type: 'deck', size, col: 0, row: 0, config: {} };
}

/** Stubs useDeckInstance's run-mode read: a preset authored at the widget's own inner grid (so fitToGrid is an identity), matching the widget's own size unless overridden. */
function mockDeck(pages: DeckPage[], size: PanelWidget['size'] = '2x2') {
  const { cols, rows } = innerGridForSize(size);
  mockUseDeckInstance.mockReturnValue({
    instance: { mode: 'fixed', activePresetId: 'p1' },
    preset: { id: 'p1', name: 'Preset', cols, rows, pageCount: pages.length, deck: { pages } },
    presets: [],
    target: null,
    loaded: true,
    error: false,
    retry: vi.fn(),
    setMode: vi.fn(),
    activate: vi.fn(),
    createPreset: vi.fn(),
    renamePreset: vi.fn(),
    deletePreset: vi.fn(),
    canUndo: false,
    canRedo: false,
    undo: vi.fn(),
    redo: vi.fn(),
    reset: vi.fn(),
    endEditBurst: vi.fn(),
  });
}

describe('DeckWidget', () => {
  beforeEach(() => {
    executeDeckAction.mockClear();
    mockUseDeckInstance.mockReset();
    mockUseRecentApps.mockReset();
    mockUseRecentApps.mockReturnValue({ apps: [], focusedProcessKey: undefined, excluded: [], loaded: true, setExcluded: vi.fn(), clear: vi.fn(), activate: vi.fn() });
  });

  it('renders one cell per inner-grid slot for the size', () => {
    mockDeck([{ slots: [] }]);
    const { container } = render(<DeckWidget widget={widget()} />);
    expect(container.querySelectorAll('[data-deck-slot-index]')).toHaveLength(4); // 2x2
  });

  it('renders a 4x4 inner grid as 16 cells', () => {
    mockDeck([{ slots: [] }], '4x4');
    const { container } = render(<DeckWidget widget={widget('4x4')} />);
    expect(container.querySelectorAll('[data-deck-slot-index]')).toHaveLength(16);
  });

  it('dispatches the slot action on press in run mode', () => {
    const deck: DeckPage[] = [{ slots: [{ action: { type: 'openUrl', url: 'https://x.com' } }] }];
    mockDeck(deck);
    const { container } = render(<DeckWidget widget={widget()} />);
    fireEvent.click(container.querySelector('[data-deck-slot-index="0"]')!);
    expect(executeDeckAction).toHaveBeenCalledWith({ type: 'openUrl', url: 'https://x.com' });
  });

  it('dispatches a monitoring slot press the same as any other action', () => {
    const deck: DeckPage[] = [{ slots: [{ action: { type: 'monitoring', category: 'cpu', sensor: 'x', style: 'line', press: 'taskManager' } }] }];
    mockDeck(deck);
    const { container } = render(<DeckWidget widget={widget()} />);
    fireEvent.click(container.querySelector('[data-deck-slot-index="0"]')!);
    expect(executeDeckAction).toHaveBeenCalledWith({ type: 'monitoring', category: 'cpu', sensor: 'x', style: 'line', press: 'taskManager' });
  });

  it('does not dispatch an empty slot', () => {
    mockDeck([{ slots: [] }]);
    const { container } = render(<DeckWidget widget={widget()} />);
    const cell = container.querySelector('[data-deck-slot-index="0"]')!;
    fireEvent.click(cell);
    expect(executeDeckAction).not.toHaveBeenCalled();
  });

  it('navigates into a folder instead of dispatching', () => {
    const deck: DeckPage[] = [{ slots: [{ folder: { slots: [{ action: { type: 'openUrl', url: 'inner' } }] } }] }];
    mockDeck(deck);
    const { container } = render(<DeckWidget widget={widget()} />);
    fireEvent.click(container.querySelector('[data-deck-slot-index="0"]')!);
    expect(executeDeckAction).not.toHaveBeenCalled();
    // After entering, slot 0 is now the inner action.
    fireEvent.click(container.querySelector('[data-deck-slot-index="0"]')!);
    expect(executeDeckAction).toHaveBeenCalledWith({ type: 'openUrl', url: 'inner' });
  });

  describe('pagination', () => {
    const marker = (url: string) => ({ action: { type: 'openUrl' as const, url } });

    it('a next-page press advances to the next page without dispatching', () => {
      const deck: DeckPage[] = [
        { slots: [{ action: { type: 'page', op: 'next' } }] },
        { slots: [marker('p1')] },
      ];
      mockDeck(deck);
      const { container } = render(<DeckWidget widget={widget()} />);
      fireEvent.click(container.querySelector('[data-deck-slot-index="0"]')!);
      expect(executeDeckAction).not.toHaveBeenCalled();
      fireEvent.click(container.querySelector('[data-deck-slot-index="0"]')!);
      expect(executeDeckAction).toHaveBeenCalledWith({ type: 'openUrl', url: 'p1' });
    });

    it('a prev-page press wraps to the last page from page 0', () => {
      const deck: DeckPage[] = [
        { slots: [{ action: { type: 'page', op: 'prev' } }] },
        { slots: [] },
        { slots: [marker('p2')] },
      ];
      mockDeck(deck);
      const { container } = render(<DeckWidget widget={widget()} />);
      fireEvent.click(container.querySelector('[data-deck-slot-index="0"]')!); // wraps 0 -> 2
      fireEvent.click(container.querySelector('[data-deck-slot-index="0"]')!);
      expect(executeDeckAction).toHaveBeenCalledWith({ type: 'openUrl', url: 'p2' });
    });

    it('a goto-page press jumps directly to the target page', () => {
      const deck: DeckPage[] = [
        { slots: [{ action: { type: 'page', op: 'goto', target: 2 } }] },
        { slots: [marker('p1')] },
        { slots: [marker('p2')] },
      ];
      mockDeck(deck);
      const { container } = render(<DeckWidget widget={widget()} />);
      fireEvent.click(container.querySelector('[data-deck-slot-index="0"]')!); // goto page 2
      fireEvent.click(container.querySelector('[data-deck-slot-index="0"]')!);
      expect(executeDeckAction).toHaveBeenCalledWith({ type: 'openUrl', url: 'p2' });
      expect(executeDeckAction).not.toHaveBeenCalledWith({ type: 'openUrl', url: 'p1' });
    });

    it('pressing a pageIndicator slot does nothing', () => {
      const deck: DeckPage[] = [{ slots: [{ action: { type: 'pageIndicator' } }] }];
      mockDeck(deck);
      const { container } = render(<DeckWidget widget={widget()} />);
      fireEvent.click(container.querySelector('[data-deck-slot-index="0"]')!);
      expect(executeDeckAction).not.toHaveBeenCalled();
    });

    it('renders the pageIndicator label as currentPage/totalPages and updates after paging', () => {
      const deck: DeckPage[] = [
        { slots: [{ action: { type: 'page', op: 'next' } }, { action: { type: 'pageIndicator' } }] },
        { slots: [{}, { action: { type: 'pageIndicator' } }] },
      ];
      mockDeck(deck);
      const { container } = render(<DeckWidget widget={widget()} />);
      expect(container.querySelector('[data-deck-slot-index="1"]')?.textContent).toContain('1/2');
      fireEvent.click(container.querySelector('[data-deck-slot-index="0"]')!);
      expect(container.querySelector('[data-deck-slot-index="1"]')?.textContent).toContain('2/2');
    });
  });

  describe('privileged action dispatch', () => {
    it('routes a privileged action through /panel/deck/dispatch when a deviceId is available', () => {
      const deck: DeckPage[] = [{ slots: [{ action: { type: 'hotkey', keys: 'ctrl+c' } }] }];
      mockDeck(deck);
      const { container } = render(<DeckWidget widget={widget()} deviceId="dev1" />);
      fireEvent.click(container.querySelector('[data-deck-slot-index="0"]')!);
      expect(executeDeckAction).toHaveBeenCalledWith(
        { type: 'hotkey', keys: 'ctrl+c' },
        { deviceId: 'dev1', widgetId: 'w1', page: 0, folderPath: [], slot: 0 },
      );
    });

    it('keeps a non-privileged action on the unchanged single-argument call', () => {
      const deck: DeckPage[] = [{ slots: [{ action: { type: 'openUrl', url: 'https://x.com' } }] }];
      mockDeck(deck);
      const { container } = render(<DeckWidget widget={widget()} deviceId="dev1" />);
      fireEvent.click(container.querySelector('[data-deck-slot-index="0"]')!);
      expect(executeDeckAction).toHaveBeenCalledWith({ type: 'openUrl', url: 'https://x.com' });
    });

    it('does not dispatch a privileged action with no deviceId (falls back to the direct route)', () => {
      const deck: DeckPage[] = [{ slots: [{ action: { type: 'hotkey', keys: 'ctrl+c' } }] }];
      mockDeck(deck);
      const { container } = render(<DeckWidget widget={widget()} />);
      fireEvent.click(container.querySelector('[data-deck-slot-index="0"]')!);
      expect(executeDeckAction).toHaveBeenCalledWith({ type: 'hotkey', keys: 'ctrl+c' });
    });

    it('a toggle press dispatches the resolved branch\'s action with branch: on', () => {
      const deck: DeckPage[] = [{
        slots: [{
          action: {
            type: 'toggle',
            on: { type: 'text', text: 'on-text' },
            off: { type: 'openUrl', url: 'https://off.example' },
          },
        }],
      }];
      mockDeck(deck);
      const { container } = render(<DeckWidget widget={widget()} deviceId="dev1" />);
      fireEvent.click(container.querySelector('[data-deck-slot-index="0"]')!);
      // No live state and no prior flip -> toggleOn() defaults to false, so the
      // press turns it on and fires the 'on' branch.
      expect(executeDeckAction).toHaveBeenCalledWith(
        { type: 'text', text: 'on-text' },
        { deviceId: 'dev1', widgetId: 'w1', page: 0, folderPath: [], slot: 0 },
        'on',
      );
    });

    it('a press inside a folder dispatches with folderPath set to the folder\'s own outer index and slot to the pressed index within it', () => {
      const deck: DeckPage[] = [{
        slots: [
          {},
          { folder: { slots: [{}, {}, { action: { type: 'hotkey', keys: 'ctrl+c' } }] } },
        ],
      }];
      mockDeck(deck);
      const { container } = render(<DeckWidget widget={widget()} deviceId="dev1" />);
      fireEvent.click(container.querySelector('[data-deck-slot-index="1"]')!); // enter the folder at outer index 1
      fireEvent.click(container.querySelector('[data-deck-slot-index="2"]')!); // press the folder's inner slot 2
      expect(executeDeckAction).toHaveBeenCalledWith(
        { type: 'hotkey', keys: 'ctrl+c' },
        { deviceId: 'dev1', widgetId: 'w1', page: 0, folderPath: [1], slot: 2 },
      );
    });

    it('a sequence containing a privileged step dispatches the whole action once', () => {
      const deck: DeckPage[] = [{
        slots: [{
          action: {
            type: 'sequence',
            steps: [
              { action: { type: 'openUrl', url: 'https://x.com' } },
              { action: { type: 'hotkey', keys: 'ctrl+v' } },
            ],
          },
        }],
      }];
      mockDeck(deck);
      const { container } = render(<DeckWidget widget={widget()} deviceId="dev1" />);
      fireEvent.click(container.querySelector('[data-deck-slot-index="0"]')!);
      expect(executeDeckAction).toHaveBeenCalledTimes(1);
      expect(executeDeckAction).toHaveBeenCalledWith(
        {
          type: 'sequence',
          steps: [
            { action: { type: 'openUrl', url: 'https://x.com' } },
            { action: { type: 'hotkey', keys: 'ctrl+v' } },
          ],
        },
        { deviceId: 'dev1', widgetId: 'w1', page: 0, folderPath: [], slot: 0 },
      );
    });
  });

  describe('Recent Apps mode', () => {
    function mockRecentAppsInstance() {
      mockUseDeckInstance.mockReturnValue({
        instance: { mode: 'recentApps', activePresetId: 'p1' },
        preset: null,
        presets: [],
        target: null,
        loaded: true,
        error: false,
        retry: vi.fn(),
        setMode: vi.fn(),
        activate: vi.fn(),
        createPreset: vi.fn(),
        renamePreset: vi.fn(),
        deletePreset: vi.fn(),
        canUndo: false,
        canRedo: false,
        undo: vi.fn(),
        redo: vi.fn(),
        reset: vi.fn(),
        endEditBurst: vi.fn(),
      });
    }

    it('renders the live ring instead of the fixed/appAware grid', () => {
      mockRecentAppsInstance();
      mockUseRecentApps.mockReturnValue({
        apps: [{ processKey: 'discord', name: 'Discord', lastFocusedUtcMs: 1 }],
        focusedProcessKey: 'discord',
        excluded: [],
        loaded: true,
        setExcluded: vi.fn(),
        clear: vi.fn(),
        activate: vi.fn(),
      });
      const { getByText } = render(<DeckWidget widget={widget()} />);
      expect(getByText('Discord')).toBeInTheDocument();
      expect(mockUseRecentApps).toHaveBeenCalledWith(true);
    });

    it('pressing an unfocused key activates that process', () => {
      mockRecentAppsInstance();
      const activate = vi.fn();
      mockUseRecentApps.mockReturnValue({
        apps: [{ processKey: 'chrome', name: 'Chrome', lastFocusedUtcMs: 1 }],
        focusedProcessKey: undefined,
        excluded: [],
        loaded: true,
        setExcluded: vi.fn(),
        clear: vi.fn(),
        activate,
      });
      const { getByText } = render(<DeckWidget widget={widget()} />);
      fireEvent.click(getByText('Chrome').closest('button')!);
      expect(activate).toHaveBeenCalledWith('chrome');
    });

    it('does not subscribe to the recent-apps ring outside Recent Apps mode', () => {
      mockDeck([{ slots: [] }]);
      render(<DeckWidget widget={widget()} />);
      expect(mockUseRecentApps).toHaveBeenCalledWith(false);
    });

    it('does not activate a recent app on tap while arranging the panel (edit mode)', () => {
      mockRecentAppsInstance();
      const activate = vi.fn();
      mockUseRecentApps.mockReturnValue({
        apps: [{ processKey: 'chrome', name: 'Chrome', lastFocusedUtcMs: 1 }],
        focusedProcessKey: undefined,
        excluded: [],
        loaded: true,
        setExcluded: vi.fn(),
        clear: vi.fn(),
        activate,
      });
      const { getByText } = render(<DeckWidget widget={widget()} onSelectSlot={vi.fn()} />);
      fireEvent.click(getByText('Chrome').closest('button')!);
      expect(activate).not.toHaveBeenCalled();
    });
  });
});
