import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatePicker, placePopupVertically } from './DatePicker';

// Mirrors the Enter-to-confirm idiom a caller like ConfirmModal wires on an
// ancestor via a bubble-phase keydown listener (see modalStack.ts).
function renderInsideKeyListener(onKey: (key: string) => void) {
  return render(
    <div onKeyDown={e => onKey(e.key)}>
      <DatePicker value="2026-08-15" onChange={vi.fn()} ariaLabel="Pick a date" />
    </div>,
  );
}

describe('DatePicker - Enter key propagation', () => {
  it('does not let Enter on the trigger reach an ancestor keydown listener', () => {
    const onKey = vi.fn();
    renderInsideKeyListener(onKey);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Pick a date' }), { key: 'Enter' });

    expect(onKey).not.toHaveBeenCalled();
  });

  it('does not let Enter on an open day cell reach an ancestor keydown listener', () => {
    const onKey = vi.fn();
    renderInsideKeyListener(onKey);

    fireEvent.click(screen.getByRole('button', { name: 'Pick a date' }));
    fireEvent.keyDown(screen.getByRole('button', { name: '15' }), { key: 'Enter' });

    expect(onKey).not.toHaveBeenCalled();
  });

  it('still lets other keys reach the ancestor listener', () => {
    const onKey = vi.fn();
    renderInsideKeyListener(onKey);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Pick a date' }), { key: 'a' });

    expect(onKey).toHaveBeenCalledWith('a');
  });
});

const VIEWPORT_BOUNDS = (bottom: number) => ({ top: 0, bottom });

describe('placePopupVertically', () => {
  it('opens below when the popup fits', () => {
    expect(placePopupVertically(100, 130, 300, VIEWPORT_BOUNDS(800))).toEqual({ above: false });
  });

  it('flips above when only the top has room', () => {
    expect(placePopupVertically(500, 530, 300, VIEWPORT_BOUNDS(600))).toEqual({ above: true });
  });

  it('caps the height to the roomier side when neither side fits', () => {
    expect(placePopupVertically(127, 157, 310, VIEWPORT_BOUNDS(450))).toEqual({ above: false, maxHeight: 450 - 157 - 6 - 8 });
    expect(placePopupVertically(300, 330, 400, VIEWPORT_BOUNDS(450))).toEqual({ above: true, maxHeight: 300 - 6 - 8 });
  });

  it('measures the top room from a scroll container, not the window', () => {
    // The window has room above the trigger, but the scroll container clips it.
    expect(placePopupVertically(220, 250, 100, { top: 200, bottom: 400 })).toEqual({ above: false });
    expect(placePopupVertically(220, 250, 400, { top: 200, bottom: 400 })).toEqual({ above: false, maxHeight: 400 - 250 - 6 - 8 });
  });
});

describe('DatePicker vertical placement', () => {
  let popupHeight = 300;
  const rects = { trigger: { top: 100, bottom: 130 }, container: { top: 0, bottom: 450 } };

  beforeEach(() => {
    popupHeight = 300;
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(450);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const r = this.dataset.testid === 'scroller' ? rects.container
        : this.getAttribute('role') === 'dialog' ? { top: 0, bottom: 0 }
        : rects.trigger;
      return { ...r, left: 0, right: 100, width: 100, height: r.bottom - r.top, x: 0, y: r.top, toJSON: () => ({}) } as DOMRect;
    });
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => popupHeight);
  });

  afterEach(() => { vi.restoreAllMocks(); });

  function open() {
    render(
      <div data-testid="scroller" style={{ overflowY: 'auto' }}>
        <DatePicker value="2026-08-15" onChange={vi.fn()} ariaLabel="Pick a date" />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Pick a date' }));
    return screen.getByRole('dialog');
  }

  it('stays below with no cap when the popup fits', () => {
    const dialog = open();
    expect(dialog.className).not.toMatch(/popupAbove/);
    expect(dialog.style.maxHeight).toBe('');
  });

  it('re-places when month navigation makes the popup taller', () => {
    const dialog = open();
    popupHeight = 400;
    fireEvent.click(screen.getByRole('button', { name: 'datepicker.nextMonth' }));
    expect(dialog.className).not.toMatch(/popupAbove/);
    
    expect(dialog.style.maxHeight).toBe(`${450 - 130 - 6 - 8}px`);
    popupHeight = 300;
    fireEvent.click(screen.getByRole('button', { name: 'datepicker.prevMonth' }));
    expect(dialog.style.maxHeight).toBe('');
  });

  it('flips above when the trigger is low and only the top fits', () => {
    rects.trigger = { top: 380, bottom: 410 };
    const dialog = open();
    expect(dialog.className).toMatch(/popupAbove/);
    rects.trigger = { top: 100, bottom: 130 };
  });

  it('does not flip above into a scroll container whose top clips it', () => {
    rects.trigger = { top: 120, bottom: 150 };
    rects.container = { top: 100, bottom: 250 };
    const dialog = open();
    expect(dialog.className).not.toMatch(/popupAbove/);
    expect(dialog.style.maxHeight).toBe(`${250 - 150 - 6 - 8}px`);
    rects.container = { top: 0, bottom: 450 };
    rects.trigger = { top: 100, bottom: 130 };
  });
});
