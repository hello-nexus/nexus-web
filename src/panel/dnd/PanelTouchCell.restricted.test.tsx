import { act, fireEvent, render } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PanelWidget } from '../types';

const onPreset = vi.fn();
function CoolingProbe() {
  return <button type="button" data-testid="preset" onClick={onPreset}>preset</button>;
}

vi.mock('../widgets/registry', () => ({
  lookupApp: () => ({ Widget: CoolingProbe, meta: { i18nKey: 'x' } }),
}));

import { PanelTouchCell } from './PanelDragCells';

const widget: PanelWidget = { id: 'w1', type: 'cooling', size: '2x2', col: 0, row: 0, config: {} } as PanelWidget;
const pointers = { onPointerDown: () => {}, onPointerMove: () => {}, onPointerUp: () => {}, onPointerCancel: () => {} };

function cell(inert: boolean, onLockDragChange?: (a: boolean) => void) {
  return (
    <DndContext>
      <SortableContext items={['w1']}>
        <PanelTouchCell widget={widget} rearranging={false} inert={inert} onLockDragChange={onLockDragChange} onContextMenu={() => {}} cellPointers={pointers} />
      </SortableContext>
    </DndContext>
  );
}

describe('PanelTouchCell inert (Restricted mode)', () => {
  afterEach(() => { vi.useRealTimers(); });

  const wrapOf = (c: HTMLElement) => c.querySelector('[data-panel-widget-id]') as HTMLElement;

  it('a click on a blocked cell nudges it and shows the locked notice, then settles', () => {
    vi.useFakeTimers();
    const { container, getByTestId } = render(cell(true));
    expect(wrapOf(container).dataset.lockNotice).toBeUndefined();
    fireEvent.click(getByTestId('preset'));
    expect(wrapOf(container).dataset.lockNotice).toBe('true');
    expect(wrapOf(container).style.transform).toMatch(/translate3d/);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(wrapOf(container).dataset.lockNotice).toBeUndefined();
  });

  it('a pulse is not a drag: the host is never told a pull started', () => {
    vi.useFakeTimers();
    const onLockDragChange = vi.fn();
    const { getByTestId } = render(cell(true, onLockDragChange));
    fireEvent.click(getByTestId('preset'));
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onLockDragChange).not.toHaveBeenCalled();
  });

  it('a drag that starts during a pulse is not cut short by the pulse timer', () => {
    vi.useFakeTimers();
    const { container, getByTestId } = render(cell(true));
    const wrap = wrapOf(container);
    wrap.setPointerCapture = () => {};
    fireEvent.click(getByTestId('preset'));
    fireEvent.pointerDown(wrap, { isPrimary: true, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, clientX: 5, clientY: 5 });
    fireEvent.pointerMove(wrap, { pointerId: 1, pointerType: 'mouse', buttons: 1, clientX: 60, clientY: 5 });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(wrap.dataset.lockNotice).toBe('true');
  });

  it('Escape passes through the key guard', () => {
    const { container, getByTestId } = render(cell(true));
    fireEvent.keyDown(getByTestId('preset'), { key: 'Escape' });
    expect(wrapOf(container).dataset.lockNotice).toBeUndefined();
  });

  it('Enter on a blocked cell shows the notice, Tab does not', () => {
    const { container, getByTestId } = render(cell(true));
    fireEvent.keyDown(getByTestId('preset'), { key: 'Tab' });
    expect(wrapOf(container).dataset.lockNotice).toBeUndefined();
    fireEvent.keyDown(getByTestId('preset'), { key: 'Enter' });
    expect(wrapOf(container).dataset.lockNotice).toBe('true');
  });

  it('a drag attempt on a blocked cell pulls it like a locked widget', () => {
    const { container } = render(cell(true));
    const wrap = wrapOf(container);
    wrap.setPointerCapture = () => {};
    fireEvent.pointerDown(wrap, { isPrimary: true, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, clientX: 5, clientY: 5 });
    fireEvent.pointerMove(wrap, { pointerId: 1, pointerType: 'mouse', buttons: 1, clientX: 60, clientY: 5 });
    expect(wrap.dataset.lockNotice).toBe('true');
  });

  it('an allowed cell shows no notice on a tap', () => {
    const { container, getByTestId } = render(cell(false));
    fireEvent.click(getByTestId('preset'));
    expect(wrapOf(container).dataset.lockNotice).toBeUndefined();
  });

  it('swallows a keyboard activation and a synthetic click before the control sees them', () => {
    onPreset.mockClear();
    const { getByTestId } = render(cell(true));
    fireEvent.keyDown(getByTestId('preset'), { key: 'Enter' });
    fireEvent.keyDown(getByTestId('preset'), { key: ' ' });
    fireEvent.click(getByTestId('preset'));
    expect(onPreset).not.toHaveBeenCalled();
  });

  it('lets a live cell click through', () => {
    onPreset.mockClear();
    const { getByTestId } = render(cell(false));
    fireEvent.click(getByTestId('preset'));
    expect(onPreset).toHaveBeenCalledTimes(1);
  });

  it('takes no pointer input inside the widget, so cooling presets cannot be pressed', () => {
    const { getByTestId } = render(cell(true));
    expect(getByTestId('restricted-inert-scaler').style.pointerEvents).toBe('none');
    expect(getByTestId('preset').closest('[data-restricted-inert]')).not.toBeNull();
  });

  it('leaves the widget interactive otherwise', () => {
    const { queryByTestId } = render(cell(false));
    expect(queryByTestId('restricted-inert-scaler')).toBeNull();
  });
});
