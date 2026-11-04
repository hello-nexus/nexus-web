import { act, fireEvent, render } from '@testing-library/react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelWidget } from '../types';
import type { DeckSlot } from '../widgets/deck/types';

const onKey = vi.hoisted(() => vi.fn());

vi.mock('../widgets/common/AppPicker', () => ({ useAppIcon: () => null }));
vi.mock('../widgets/deck/useDeckImage', () => ({ useDeckImage: () => ({ url: null, isVideo: false }) }));
vi.mock('../widgets/deck/useSiteIcon', () => ({ useSiteIcon: () => null }));
// DeckGrid is read at render time: importing it inside the factory would cycle through the registry.
vi.mock('../widgets/registry', () => {
  const slots: DeckSlot[] = [{ label: 'a', action: { type: 'hotkey', keys: 'ctrl+a' } }];
  const Widget = () => <DeckGrid slots={slots} cols={1} rows={1} selectable={false} onCell={onKey} />;
  return { lookupApp: () => ({ Widget, meta: { i18nKey: 'x' } }) };
});

import { PanelTouchCell } from './PanelDragCells';
import { DeckGrid } from '../widgets/deck/DeckGrid';
import { PANEL_CONTEXT_MENU_TRIGGER_MS, usePanelTouchMode } from '../engine/usePanelTouchMode';

const widget: PanelWidget = { id: 'w1', type: 'deck', size: '2x2', col: 0, row: 0, config: {} } as PanelWidget;
const touch = { pointerType: 'touch', isPrimary: true, clientX: 10, clientY: 10 };

function Harness({ menuDisabled = false, locked = false, onMenu }: { menuDisabled?: boolean; locked?: boolean; onMenu: (open: boolean) => void }) {
  const mode = usePanelTouchMode({ menuDisabled });
  onMenu(mode.ctxMenu !== null);
  // The panel's touch activation is a hold, and restricted mode registers no drag sensor.
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { delay: PANEL_CONTEXT_MENU_TRIGGER_MS, tolerance: 8 } });
  const sensors = useSensors(menuDisabled ? null : pointerSensor);
  return (
    <DndContext sensors={sensors}>
      <SortableContext items={['w1']}>
        <PanelTouchCell
          widget={widget}
          rearranging={false}
          locked={locked}
          onContextMenu={e => mode.handleContextMenu(e, widget)}
          cellPointers={mode.bindCellPointers(widget)}
        />
      </SortableContext>
    </DndContext>
  );
}

function setup(props: { menuDisabled?: boolean; locked?: boolean } = {}) {
  const onMenu = vi.fn();
  const { container } = render(<Harness {...props} onMenu={onMenu} />);
  const key = container.querySelector('[data-deck-slot-index="0"]') as HTMLElement;
  const menuOpen = () => onMenu.mock.calls[onMenu.mock.calls.length - 1][0] as boolean;
  return { key, menuOpen };
}

function hold(key: HTMLElement) {
  fireEvent.pointerDown(key, touch);
  act(() => { vi.advanceTimersByTime(PANEL_CONTEXT_MENU_TRIGGER_MS + 10); });
  fireEvent.pointerUp(key, touch);
  fireEvent.click(key, { detail: 1 });
  act(() => { vi.advanceTimersByTime(100); });
}

describe('deck key hold through the panel cell', () => {
  beforeEach(() => { vi.useFakeTimers(); onKey.mockClear(); });
  // dnd-kit removes its document-level post-drag click guard on a timer; flush it so it cannot swallow the next test's click.
  afterEach(() => { act(() => { vi.runOnlyPendingTimers(); }); vi.useRealTimers(); });

  it('opens the menu and does not fire the key', () => {
    const { key, menuOpen } = setup();
    hold(key);
    expect(menuOpen()).toBe(true);
    expect(onKey).not.toHaveBeenCalled();
  });

  it('a tap fires the key once and opens no menu', () => {
    const { key, menuOpen } = setup();
    fireEvent.pointerDown(key, touch);
    act(() => { vi.advanceTimersByTime(50); });
    fireEvent.pointerUp(key, touch);
    fireEvent.click(key, { detail: 1 });
    expect(menuOpen()).toBe(false);
    expect(onKey).toHaveBeenCalledTimes(1);
  });

  it('with the menu disabled a hold opens nothing and still fires the key', () => {
    const { key, menuOpen } = setup({ menuDisabled: true });
    hold(key);
    expect(menuOpen()).toBe(false);
    expect(onKey).toHaveBeenCalledTimes(1);
  });

  it('on a locked cell a hold opens the menu and does not fire the key', () => {
    const { key, menuOpen } = setup({ locked: true });
    hold(key);
    expect(menuOpen()).toBe(true);
    expect(onKey).not.toHaveBeenCalled();
  });

  it('keyboard activation after a hold still fires the key', () => {
    const { key } = setup();
    hold(key);
    fireEvent.click(key, { detail: 0 });
    expect(onKey).toHaveBeenCalledTimes(1);
  });
});

describe('selectable deck key', () => {
  it('stops pointerdown so the editor grid owns the press', () => {
    const outer = vi.fn();
    const slots: DeckSlot[] = [{ action: { type: 'hotkey', keys: 'ctrl+a' } }];
    const { container } = render(
      <div onPointerDown={outer}>
        <DeckGrid slots={slots} cols={1} rows={1} selectable onCell={() => {}} />
      </div>,
    );
    fireEvent.pointerDown(container.querySelector('[data-deck-slot-index="0"]')!, touch);
    expect(outer).not.toHaveBeenCalled();
  });
});
