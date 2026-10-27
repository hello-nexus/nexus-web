// @vitest-environment jsdom
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PANEL_CONTEXT_MENU_TRIGGER_MS } from '../engine/usePanelTouchMode';
import type { DragActivation } from '../engine/pointerDragSensor';
import { LOCK_DRAG_MAX_PX, exceedsDragThreshold, isOwnControl, rubberBandOffset, useLockNotice } from './useLockNotice';

function Probe({ locked, activation = 'distance' }: { locked: boolean; activation?: DragActivation }) {
  const { visible, offset, handlers } = useLockNotice(locked, () => activation);
  return (
    <div
      data-testid="body"
      data-visible={visible ? 'yes' : 'no'}
      data-offset={offset ? `${offset.x},${offset.y}` : ''}
      onPointerDown={handlers.onPointerDown}
      onPointerMove={handlers.onPointerMove}
      onPointerUp={handlers.end}
      onPointerCancel={handlers.end}
      onLostPointerCapture={handlers.onLostPointerCapture}
    >
      <button type="button">inner</button>
      <span data-testid="face">12:00</span>
      <div data-panel-interactive="true"><span data-testid="stage">stage</span></div>
      <div data-panel-interactive="true" data-layer-gestures="true"><span data-testid="item" data-manipulable-id="m">item</span><span data-testid="water">water</span></div>
    </div>
  );
}

const visible = (el: HTMLElement) => el.getAttribute('data-visible') === 'yes';
const offsetOf = (el: HTMLElement) => (el.getAttribute('data-offset') ?? '').split(',').filter(Boolean).map(Number);

describe('useLockNotice', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows nothing for a tap, however long the press', () => {
    const { getByTestId } = render(<Probe locked />);
    const body = getByTestId('body');
    fireEvent.pointerDown(body, { isPrimary: true, clientX: 10, clientY: 10 });
    act(() => { vi.advanceTimersByTime(5000); });
    expect(visible(body)).toBe(false);
    fireEvent.pointerUp(body, { clientX: 10, clientY: 10 });
    expect(visible(body)).toBe(false);
  });

  it('pulls the tile with the pointer past the threshold and settles it on release', () => {
    const { getByTestId } = render(<Probe locked />);
    const body = getByTestId('body');
    fireEvent.pointerDown(body, { isPrimary: true, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(body, { clientX: 14, clientY: 10 });
    expect(visible(body)).toBe(false);
    fireEvent.pointerMove(body, { clientX: 40, clientY: 10 });
    expect(visible(body)).toBe(true);
    expect(offsetOf(body)[0]).toBeGreaterThan(0);
    fireEvent.pointerUp(body, { clientX: 40, clientY: 10 });
    expect(visible(body)).toBe(false);
    expect(offsetOf(body)).toEqual([]);
  });

  it('never moves the tile past the cap', () => {
    const { getByTestId } = render(<Probe locked />);
    const body = getByTestId('body');
    fireEvent.pointerDown(body, { isPrimary: true, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(body, { clientX: 3000, clientY: 4000 });
    const [x, y] = offsetOf(body);
    expect(Math.hypot(x, y)).toBeLessThanOrEqual(LOCK_DRAG_MAX_PX);
  });

  it('does nothing when unlocked', () => {
    const { getByTestId } = render(<Probe locked={false} />);
    const body = getByTestId('body');
    fireEvent.pointerDown(body, { isPrimary: true, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(body, { clientX: 80, clientY: 10 });
    expect(visible(body)).toBe(false);
    expect(offsetOf(body)).toEqual([]);
  });

  it('ignores presses on the widget\'s own controls', () => {
    const { getByTestId, getByText } = render(<Probe locked />);
    const button = getByText('inner');
    fireEvent.pointerDown(button, { isPrimary: true, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(button, { clientX: 80, clientY: 10 });
    expect(visible(getByTestId('body'))).toBe(false);
  });

  it('does not react to a hover with no press', () => {
    const { getByTestId } = render(<Probe locked />);
    const body = getByTestId('body');
    fireEvent.pointerMove(body, { clientX: 80, clientY: 10 });
    expect(visible(body)).toBe(false);
  });

  it('drops the drag when the press is cancelled', () => {
    const { getByTestId } = render(<Probe locked />);
    const body = getByTestId('body');
    fireEvent.pointerDown(body, { isPrimary: true, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(body, { clientX: 80, clientY: 10 });
    fireEvent.pointerCancel(body);
    expect(visible(body)).toBe(false);
    fireEvent.pointerMove(body, { clientX: 120, clientY: 10 });
    expect(visible(body)).toBe(false);
  });

  it('pulls from a body drag on a tap-only SDK stage', () => {
    const { getByTestId } = render(<Probe locked />);
    const stage = getByTestId('stage');
    fireEvent.pointerDown(stage, { isPrimary: true, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(stage, { clientX: 90, clientY: 10 });
    expect(visible(getByTestId('body'))).toBe(true);
  });

  it('never starts a pull from a grabbed manipulable of a gesture stage, but does from its empty water', () => {
    const { getByTestId } = render(<Probe locked />);
    const item = getByTestId('item');
    fireEvent.pointerDown(item, { isPrimary: true, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(item, { clientX: 90, clientY: 10 });
    expect(visible(getByTestId('body'))).toBe(false);
    fireEvent.pointerUp(item);
    const water = getByTestId('water');
    fireEvent.pointerDown(water, { isPrimary: true, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(water, { clientX: 90, clientY: 10 });
    expect(visible(getByTestId('body'))).toBe(true);
  });

  it('ends the pull when a mouse move reports no button held', () => {
    const { getByTestId } = render(<Probe locked />);
    const body = getByTestId('body');
    fireEvent.pointerDown(body, { isPrimary: true, clientX: 10, clientY: 10, pointerType: 'mouse', buttons: 1 });
    fireEvent.pointerMove(body, { clientX: 60, clientY: 10, pointerType: 'mouse', buttons: 1 });
    expect(visible(body)).toBe(true);
    fireEvent.pointerMove(body, { clientX: 70, clientY: 10, pointerType: 'mouse', buttons: 0 });
    expect(visible(body)).toBe(false);
  });

  it('ends the pull when the window loses focus', () => {
    const { getByTestId } = render(<Probe locked />);
    const body = getByTestId('body');
    fireEvent.pointerDown(body, { isPrimary: true, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(body, { clientX: 60, clientY: 10 });
    expect(visible(body)).toBe(true);
    act(() => { window.dispatchEvent(new Event('blur')); });
    expect(visible(body)).toBe(false);
  });

  it('ends the pull on a release outside the tile', () => {
    const { getByTestId } = render(<Probe locked />);
    const body = getByTestId('body');
    fireEvent.pointerDown(body, { isPrimary: true, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(body, { clientX: 60, clientY: 10 });
    expect(visible(body)).toBe(true);
    fireEvent.pointerUp(document.body, { clientX: 60, clientY: 10 });
    expect(visible(body)).toBe(false);
  });

  it('ends a pull whose release never arrived on the next press anywhere', () => {
    const { getByTestId } = render(<Probe locked />);
    const body = getByTestId('body');
    fireEvent.pointerDown(body, { isPrimary: true, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(body, { clientX: 60, clientY: 10 });
    expect(visible(body)).toBe(true);
    fireEvent.pointerDown(document.body, { isPrimary: true, clientX: 500, clientY: 10 });
    expect(visible(body)).toBe(false);
  });

  it('keeps pulling when an inner element loses its capture', () => {
    const { getByTestId } = render(<Probe locked />);
    const body = getByTestId('body');
    body.setPointerCapture = vi.fn();
    body.hasPointerCapture = () => true;
    body.releasePointerCapture = vi.fn();
    fireEvent.pointerDown(body, { isPrimary: true, clientX: 10, clientY: 10, pointerId: 4 });
    fireEvent.pointerMove(body, { clientX: 60, clientY: 10, pointerId: 4 });
    fireEvent.lostPointerCapture(getByTestId('face'), { pointerId: 4 });
    expect(visible(body)).toBe(true);
    fireEvent.lostPointerCapture(body, { pointerId: 4 });
    expect(visible(body)).toBe(false);
  });

  it('drops a stale press when a mouse move reports no button held', () => {
    const { getByTestId } = render(<Probe locked />);
    const body = getByTestId('body');
    fireEvent.pointerDown(body, { isPrimary: true, clientX: 10, clientY: 10, pointerType: 'mouse', buttons: 1 });
    fireEvent.pointerMove(body, { clientX: 40, clientY: 10, pointerType: 'mouse', buttons: 0 });
    fireEvent.pointerMove(body, { clientX: 80, clientY: 10, pointerType: 'mouse', buttons: 1 });
    expect(visible(body)).toBe(false);
  });

  it('ends the pull when pointer capture is lost', () => {
    const { getByTestId } = render(<Probe locked />);
    const body = getByTestId('body');
    fireEvent.pointerDown(body, { isPrimary: true, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(body, { clientX: 60, clientY: 10 });
    fireEvent.lostPointerCapture(body);
    expect(visible(body)).toBe(false);
  });

  it('on a hold-to-drag press ignores early movement and follows once the hold completes', () => {
    const { getByTestId } = render(<Probe locked activation="delay" />);
    const body = getByTestId('body');
    fireEvent.pointerDown(body, { isPrimary: true, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(body, { clientX: 40, clientY: 10 });
    expect(visible(body)).toBe(false);
    fireEvent.pointerUp(body);
    fireEvent.pointerDown(body, { isPrimary: true, clientX: 10, clientY: 10 });
    act(() => { vi.advanceTimersByTime(PANEL_CONTEXT_MENU_TRIGGER_MS + 1); });
    fireEvent.pointerMove(body, { clientX: 40, clientY: 10 });
    expect(visible(body)).toBe(true);
  });
});

describe('helpers', () => {
  it('measures the drag threshold', () => {
    expect(exceedsDragThreshold(3, 3)).toBe(false);
    expect(exceedsDragThreshold(10, 0)).toBe(true);
  });
  it('resists more the further it is pulled', () => {
    const near = rubberBandOffset(10, 0).x / 10;
    const far = rubberBandOffset(100, 0).x / 100;
    expect(near).toBeGreaterThan(far);
    expect(rubberBandOffset(0, 0)).toEqual({ x: 0, y: 0 });
    expect(rubberBandOffset(-500, 0).x).toBeGreaterThanOrEqual(-LOCK_DRAG_MAX_PX);
  });
  it('recognises controls', () => {
    const b = document.createElement('button');
    expect(isOwnControl(b)).toBe(true);
    expect(isOwnControl(document.createElement('div'))).toBe(false);
    expect(isOwnControl(null)).toBe(false);
    const cell = document.createElement('div');
    cell.setAttribute('role', 'button');
    const face = document.createElement('span');
    cell.appendChild(face);
    expect(isOwnControl(face, cell)).toBe(false);
    expect(isOwnControl(face)).toBe(true);
  });
});
