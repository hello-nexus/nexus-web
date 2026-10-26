import { act, render, screen } from '@testing-library/react';
import { DndContext, useDraggable, useSensor, useSensors } from '@dnd-kit/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdaptivePointerSensor, dragActivationFor } from './pointerDragSensor';

describe('dragActivationFor', () => {
  it('drags a plain mouse on distance', () => {
    expect(dragActivationFor('mouse', false)).toBe('distance');
  });
  it('holds first for touch, pen and a mouse standing in for touch', () => {
    expect(dragActivationFor('touch', false)).toBe('delay');
    expect(dragActivationFor('pen', false)).toBe('delay');
    expect(dragActivationFor('mouse', true)).toBe('delay');
    expect(dragActivationFor('touch', true)).toBe('delay');
  });
});

const HOLD_MS = 400;
const DISTANCE = 6;

function Harness({ mouseAsTouch, onStart, onCancel, onEnd }: { mouseAsTouch: boolean; onStart: () => void; onCancel?: () => void; onEnd?: () => void }) {
  const sensor = useSensor(AdaptivePointerSensor, {
    activationConstraint: undefined,
    constraintFor: (e: PointerEvent) => (dragActivationFor(e.pointerType, mouseAsTouch) === 'distance'
      ? { distance: DISTANCE }
      : { delay: HOLD_MS, tolerance: 8 }),
  });
  const sensors = useSensors(sensor);
  return (
    <DndContext sensors={sensors} onDragStart={onStart} onDragCancel={onCancel} onDragEnd={onEnd}>
      <Card />
    </DndContext>
  );
}

function Card() {
  const { setNodeRef, listeners, attributes } = useDraggable({ id: 'w' });
  return <div ref={setNodeRef} data-testid="card" {...listeners} {...attributes}>card</div>;
}

// jsdom's PointerEvent lacks pointerType/isPrimary in its init, so the fields are pinned on the event.
function press(el: Element, pointerType: string) {
  const event = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 10, clientY: 10 });
  Object.assign(event, { pointerType, isPrimary: true, pointerId: 1 });
  act(() => { el.dispatchEvent(event); });
}
function move(pointerType: string, x: number, buttons = 1) {
  const event = new MouseEvent('pointermove', { bubbles: true, cancelable: true, clientX: x, clientY: 10, buttons });
  Object.assign(event, { pointerType, isPrimary: true, pointerId: 1 });
  act(() => { document.dispatchEvent(event); });
}

describe('drag through DndContext', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts a mouse drag on distance, without a hold', () => {
    const onStart = vi.fn();
    render(<Harness mouseAsTouch={false} onStart={onStart} />);
    press(screen.getByTestId('card'), 'mouse');
    move('mouse', 10 + DISTANCE + 2);
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('keeps a touch press from dragging by movement alone, and arms it after the hold', () => {
    const onStart = vi.fn();
    render(<Harness mouseAsTouch={false} onStart={onStart} />);
    press(screen.getByTestId('card'), 'touch');
    move('touch', 10 + 2);
    expect(onStart).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(HOLD_MS + 10); });
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('holds first for a mouse standing in for touch', () => {
    const onStart = vi.fn();
    render(<Harness mouseAsTouch onStart={onStart} />);
    press(screen.getByTestId('card'), 'mouse');
    move('mouse', 10 + DISTANCE + 2);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('cancels a live drag when a move arrives with no button held', () => {
    const onCancel = vi.fn();
    render(<Harness mouseAsTouch={false} onStart={vi.fn()} onCancel={onCancel} />);
    press(screen.getByTestId('card'), 'mouse');
    move('mouse', 10 + DISTANCE + 2);
    move('mouse', 40, 0);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('cancels a live drag when the window loses focus', () => {
    const onCancel = vi.fn();
    render(<Harness mouseAsTouch={false} onStart={vi.fn()} onCancel={onCancel} />);
    press(screen.getByTestId('card'), 'mouse');
    move('mouse', 10 + DISTANCE + 2);
    act(() => { window.dispatchEvent(new Event('blur')); });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('cancels a live drag on pointercancel', () => {
    const onCancel = vi.fn();
    render(<Harness mouseAsTouch={false} onStart={vi.fn()} onCancel={onCancel} />);
    press(screen.getByTestId('card'), 'mouse');
    move('mouse', 10 + DISTANCE + 2);
    act(() => { document.dispatchEvent(new Event('pointercancel')); });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('stops watching once the drag ends', () => {
    const onCancel = vi.fn();
    const onEnd = vi.fn();
    render(<Harness mouseAsTouch={false} onStart={vi.fn()} onCancel={onCancel} onEnd={onEnd} />);
    press(screen.getByTestId('card'), 'mouse');
    move('mouse', 10 + DISTANCE + 2);
    act(() => { document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })); });
    move('mouse', 40, 0);
    act(() => { window.dispatchEvent(new Event('blur')); });
    expect(onEnd).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
