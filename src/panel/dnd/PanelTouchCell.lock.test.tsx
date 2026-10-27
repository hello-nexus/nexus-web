// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { describe, expect, it, vi } from 'vitest';
import type { PanelWidget } from '../types';
import { LOCK_DRAG_MAX_PX } from './useLockNotice';

const clicked = vi.fn();
const bodyClicked = vi.fn();
function Face() {
  return (
    <div onClick={bodyClicked}>
      <span data-testid="face">face</span>
      <div data-panel-interactive="true"><span data-testid="stage">stage</span></div>
      <div data-panel-interactive="true" data-layer-gestures="true"><span data-testid="item" data-manipulable-id="m">item</span></div>
      <button type="button" data-testid="control" onClick={clicked}>go</button>
    </div>
  );
}

vi.mock('../widgets/registry', () => ({
  lookupApp: () => ({ Widget: Face, meta: { i18nKey: 'x' } }),
}));

import { PanelTouchCell } from './PanelDragCells';

const widget: PanelWidget = { id: 'w1', type: 'twitch', size: '2x2', col: 1, row: 2, config: {} } as PanelWidget;

function setup(locked: boolean) {
  const pointers = { onPointerDown: vi.fn(), onPointerMove: vi.fn(), onPointerUp: vi.fn(), onPointerCancel: vi.fn() };
  const onLockDragChange = vi.fn();
  const view = render(
    <DndContext>
      <SortableContext items={['w1']}>
        <PanelTouchCell widget={widget} rearranging={false} onContextMenu={() => {}} cellPointers={pointers} locked={locked} onLockDragChange={onLockDragChange} />
      </SortableContext>
    </DndContext>,
  );
  const wrap = view.container.querySelector('[data-panel-widget-id]') as HTMLElement;
  const capture = { set: vi.fn(), release: vi.fn() };
  let held = false;
  wrap.setPointerCapture = (id: number) => { held = true; capture.set(id); };
  wrap.hasPointerCapture = () => held;
  wrap.releasePointerCapture = (id: number) => { held = false; capture.release(id); };
  return { ...view, wrap, pointers, onLockDragChange, capture };
}

const travel = (wrap: HTMLElement) => {
  const m = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(wrap.style.transform);
  return m ? Math.hypot(Number(m[1]), Number(m[2])) : 0;
};

describe('locked widget in a cell', () => {
  it('shows no notice on a click and lets the control receive it', () => {
    const { wrap, getByTestId, pointers, onLockDragChange } = setup(true);
    const control = getByTestId('control');
    fireEvent.pointerDown(control, { isPrimary: true, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(control, { clientX: 5, clientY: 5 });
    fireEvent.click(control);
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(wrap.dataset.lockNotice).toBeUndefined();
    fireEvent.pointerDown(getByTestId('face'), { clientX: 5, clientY: 5 });
    fireEvent.pointerUp(getByTestId('face'), { clientX: 5, clientY: 5 });
    expect(wrap.dataset.lockNotice).toBeUndefined();
    expect(pointers.onPointerUp).toHaveBeenCalledTimes(2);
    expect(onLockDragChange).not.toHaveBeenCalled();
  });

  it('pulls the tile at most the cap, shows the notice, and returns it on release with the layout unchanged', () => {
    const { wrap, getByTestId, pointers, onLockDragChange, capture } = setup(true);
    const face = getByTestId('face');
    fireEvent.pointerDown(face, { isPrimary: true, clientX: 0, clientY: 0, pointerId: 3 });
    fireEvent.pointerMove(face, { clientX: 400, clientY: 300, pointerId: 3 });
    expect(wrap.dataset.lockNotice).toBe('true');
    expect(travel(wrap)).toBeGreaterThan(0);
    expect(travel(wrap)).toBeLessThanOrEqual(LOCK_DRAG_MAX_PX);
    fireEvent.pointerMove(face, { clientX: 800, clientY: 600, pointerId: 3 });
    expect(travel(wrap)).toBeLessThanOrEqual(LOCK_DRAG_MAX_PX);
    expect(onLockDragChange.mock.calls).toEqual([[true]]);
    expect(capture.set).toHaveBeenCalledTimes(1);

    fireEvent.pointerUp(face, { clientX: 800, clientY: 600, pointerId: 3 });
    expect(wrap.dataset.lockNotice).toBeUndefined();
    expect(wrap.style.transform).toBe('');
    expect(onLockDragChange.mock.calls).toEqual([[true], [false]]);
    expect(capture.release).toHaveBeenCalledTimes(1);
    expect(pointers.onPointerUp).not.toHaveBeenCalled();
    expect(pointers.onPointerCancel).toHaveBeenCalledTimes(1);
    expect(wrap.dataset.panelCellCol).toBe('1');
    expect(wrap.dataset.panelCellRow).toBe('2');
  });

  it('withholds the tap on release even when the pull already ended on lost capture', () => {
    const { wrap, getByTestId, pointers } = setup(true);
    const face = getByTestId('face');
    fireEvent.pointerDown(face, { isPrimary: true, clientX: 0, clientY: 0, pointerId: 2 });
    fireEvent.pointerMove(face, { clientX: 100, clientY: 0, pointerId: 2 });
    fireEvent.lostPointerCapture(wrap, { pointerId: 2 });
    fireEvent.pointerUp(face, { clientX: 100, clientY: 0, pointerId: 2 });
    expect(pointers.onPointerUp).not.toHaveBeenCalled();
    expect(pointers.onPointerCancel).toHaveBeenCalled();
  });

  it('swallows the click that follows a pull and passes a later plain click', () => {
    bodyClicked.mockClear();
    const { getByTestId } = setup(true);
    const face = getByTestId('face');
    fireEvent.pointerDown(face, { isPrimary: true, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(face, { clientX: 100, clientY: 0 });
    fireEvent.pointerUp(face, { clientX: 100, clientY: 0 });
    fireEvent.click(face);
    expect(bodyClicked).not.toHaveBeenCalled();
    fireEvent.pointerDown(face, { isPrimary: true, clientX: 0, clientY: 0 });
    fireEvent.pointerUp(face, { clientX: 0, clientY: 0 });
    fireEvent.click(face);
    expect(bodyClicked).toHaveBeenCalledTimes(1);
  });

  it('pulls and captures from a drag on a tap-only SDK stage', () => {
    const { wrap, getByTestId, onLockDragChange, capture } = setup(true);
    const stage = getByTestId('stage');
    fireEvent.pointerDown(stage, { isPrimary: true, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(stage, { clientX: 300, clientY: 0 });
    expect(wrap.dataset.lockNotice).toBe('true');
    expect(capture.set).toHaveBeenCalledTimes(1);
    expect(onLockDragChange).toHaveBeenCalledWith(true);
  });

  it('keeps a gesture stage item\'s own capture: no pull, no capture', () => {
    const { wrap, getByTestId, onLockDragChange, capture } = setup(true);
    const item = getByTestId('item');
    fireEvent.pointerDown(item, { isPrimary: true, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(item, { clientX: 300, clientY: 0 });
    expect(wrap.dataset.lockNotice).toBeUndefined();
    expect(capture.set).not.toHaveBeenCalled();
    expect(onLockDragChange).not.toHaveBeenCalled();
  });

  it('leaves an unlocked widget alone', () => {
    const { wrap, getByTestId, onLockDragChange } = setup(false);
    const face = getByTestId('face');
    fireEvent.pointerDown(face, { isPrimary: true, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(face, { clientX: 400, clientY: 300 });
    expect(wrap.dataset.lockNotice).toBeUndefined();
    expect(wrap.style.transform).toBe('');
    expect(onLockDragChange).not.toHaveBeenCalled();
  });
});
