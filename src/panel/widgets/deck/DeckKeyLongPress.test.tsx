import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeckGrid } from './DeckGrid';
import { PANEL_CONTEXT_MENU_TRIGGER_MS, usePanelTouchMode } from '../../engine/usePanelTouchMode';
import { LONG_PRESS_MOVE_THRESHOLD } from '../../engine/useLongPress';
import type { PanelWidget } from '../../types';
import type { DeckSlot } from './types';

vi.mock('../common/AppPicker', () => ({ useAppIcon: () => null }));
vi.mock('./useDeckImage', () => ({ useDeckImage: () => ({ url: null, isVideo: false }) }));
vi.mock('./useSiteIcon', () => ({ useSiteIcon: () => null }));

const widget: PanelWidget = { id: 'deck-1', type: 'deck', size: '2x2', col: 0, row: 0, config: {} };
const slots: DeckSlot[] = [
  { label: 'a', action: { type: 'hotkey', keys: 'ctrl+a' } },
  { label: 'b', action: { type: 'hotkey', keys: 'ctrl+b' } },
];

// The panel cell wrapper binds these pointers around the widget body.
function Harness({ onCell, onMenu }: { onCell: (i: number) => void; onMenu: (open: boolean) => void }) {
  const touch = usePanelTouchMode({});
  onMenu(touch.ctxMenu !== null);
  return (
    <div data-testid="cell" {...touch.bindCellPointers(widget)}>
      <DeckGrid slots={slots} cols={2} rows={1} selectable={false} onCell={onCell} />
    </div>
  );
}

function setup() {
  const onCell = vi.fn();
  const onMenu = vi.fn();
  const utils = render(<Harness onCell={onCell} onMenu={onMenu} />);
  const key = utils.container.querySelector('[data-deck-slot-index="0"]') as HTMLElement;
  const menuOpen = () => onMenu.mock.calls[onMenu.mock.calls.length - 1][0] as boolean;
  return { key, onCell, menuOpen };
}

const touch = { pointerType: 'touch', isPrimary: true, clientX: 10, clientY: 10 };

describe('deck key hold opens the widget menu', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('a hold on a key opens the menu and the release does not fire the key action', () => {
    const { key, onCell, menuOpen } = setup();
    fireEvent.pointerDown(key, touch);
    act(() => { vi.advanceTimersByTime(PANEL_CONTEXT_MENU_TRIGGER_MS + 10); });
    expect(menuOpen()).toBe(true);
    fireEvent.pointerUp(key, touch);
    fireEvent.click(key, { detail: 1 });
    expect(onCell).not.toHaveBeenCalled();
  });

  it('a tap on a key fires its action exactly once and opens no menu', () => {
    const { key, onCell, menuOpen } = setup();
    fireEvent.pointerDown(key, touch);
    act(() => { vi.advanceTimersByTime(50); });
    fireEvent.pointerUp(key, touch);
    fireEvent.click(key, { detail: 1 });
    expect(menuOpen()).toBe(false);
    expect(onCell).toHaveBeenCalledTimes(1);
    expect(onCell).toHaveBeenCalledWith(0);
  });

  it('a click after a hold, once the release window passed, fires normally', () => {
    const { key, onCell } = setup();
    fireEvent.pointerDown(key, touch);
    act(() => { vi.advanceTimersByTime(PANEL_CONTEXT_MENU_TRIGGER_MS + 10); });
    fireEvent.pointerUp(key, touch);
    act(() => { vi.advanceTimersByTime(1000); });
    fireEvent.click(key, { detail: 1 });
    expect(onCell).toHaveBeenCalledTimes(1);
  });

  it('moving past the tolerance cancels the hold', () => {
    const { key, menuOpen } = setup();
    fireEvent.pointerDown(key, touch);
    fireEvent.pointerMove(key, { ...touch, clientX: 10 + LONG_PRESS_MOVE_THRESHOLD + 5 });
    act(() => { vi.advanceTimersByTime(PANEL_CONTEXT_MENU_TRIGGER_MS + 100); });
    expect(menuOpen()).toBe(false);
  });
});
