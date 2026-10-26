// @vitest-environment jsdom
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCK_HOLD_MS, LOCK_NOTICE_MS, exceedsDragThreshold, isOwnControl, useLockNotice } from './useLockNotice';

function Probe({ locked }: { locked: boolean }) {
  const { visible, handlers } = useLockNotice(locked);
  return (
    <div data-testid="body" data-visible={visible ? 'yes' : 'no'} {...handlers}>
      <button type="button">inner</button>
      <span data-testid="face">12:00</span>
    </div>
  );
}

// The sortable cell wrapper is role="button", as dnd-kit's attributes make it.
function SortableProbe({ locked }: { locked: boolean }) {
  const { visible, handlers } = useLockNotice(locked);
  return (
    <div role="button" tabIndex={0} data-testid="cell" data-visible={visible ? 'yes' : 'no'} {...handlers}>
      <span data-testid="face">12:00</span>
    </div>
  );
}

const visible = (el: HTMLElement) => el.getAttribute('data-visible') === 'yes';

describe('useLockNotice', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows on a drag past the threshold and fades out after a delay', () => {
    const { getByTestId } = render(<Probe locked />);
    const body = getByTestId('body');
    fireEvent.pointerDown(body, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(body, { clientX: 40, clientY: 10 });
    expect(visible(body)).toBe(true);
    act(() => { vi.advanceTimersByTime(LOCK_NOTICE_MS + 1); });
    expect(visible(body)).toBe(false);
  });

  it('shows on a hold and on a tap on the body', () => {
    const { getByTestId } = render(<Probe locked />);
    const body = getByTestId('body');
    fireEvent.pointerDown(body, { clientX: 10, clientY: 10 });
    act(() => { vi.advanceTimersByTime(LOCK_HOLD_MS + 1); });
    expect(visible(body)).toBe(true);
    act(() => { vi.advanceTimersByTime(LOCK_NOTICE_MS + 1); });
    fireEvent.pointerUp(body, { clientX: 10, clientY: 10 });
    expect(visible(body)).toBe(true);
  });

  it('does not show for a small wobble before release is a tap only, nor when unlocked', () => {
    const { getByTestId, rerender } = render(<Probe locked={false} />);
    const body = getByTestId('body');
    fireEvent.pointerDown(body, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(body, { clientX: 80, clientY: 10 });
    fireEvent.pointerUp(body, { clientX: 80, clientY: 10 });
    act(() => { vi.advanceTimersByTime(LOCK_HOLD_MS + 1); });
    expect(visible(body)).toBe(false);
    rerender(<Probe locked={false} />);
    expect(visible(body)).toBe(false);
  });

  it('ignores presses on the widget\'s own controls', () => {
    const { getByTestId, getByText } = render(<Probe locked />);
    const body = getByTestId('body');
    const button = getByText('inner');
    fireEvent.pointerDown(button, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(button, { clientX: 80, clientY: 10 });
    fireEvent.pointerUp(button, { clientX: 80, clientY: 10 });
    act(() => { vi.advanceTimersByTime(LOCK_HOLD_MS + 1); });
    expect(visible(body)).toBe(false);
  });

  it('does not show on a hover with no press', () => {
    const { getByTestId } = render(<Probe locked />);
    const body = getByTestId('body');
    fireEvent.pointerMove(body, { clientX: 80, clientY: 10 });
    fireEvent.pointerEnter(body);
    expect(visible(body)).toBe(false);
  });

  it('cancels the hold when the press is cancelled', () => {
    const { getByTestId } = render(<Probe locked />);
    const body = getByTestId('body');
    fireEvent.pointerDown(body, { clientX: 10, clientY: 10 });
    fireEvent.pointerCancel(body);
    act(() => { vi.advanceTimersByTime(LOCK_HOLD_MS + 1); });
    expect(visible(body)).toBe(false);
  });
});

describe('useLockNotice on a sortable cell', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows when the widget face is dragged, though the cell itself is role=button', () => {
    const { getByTestId } = render(<SortableProbe locked />);
    const cell = getByTestId('cell');
    fireEvent.pointerDown(getByTestId('face'), { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(getByTestId('face'), { clientX: 60, clientY: 10 });
    expect(visible(cell)).toBe(true);
  });
});

describe('helpers', () => {
  it('measures the drag threshold', () => {
    expect(exceedsDragThreshold(3, 3)).toBe(false);
    expect(exceedsDragThreshold(10, 0)).toBe(true);
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
