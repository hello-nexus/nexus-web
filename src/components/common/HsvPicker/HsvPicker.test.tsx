import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HsvPicker } from './HsvPicker';

// jsdom gives every element a 0x0 rect, so the drag readers would bail. These
// dimensions make a client pixel map to one saturation/value percent and one
// degree of hue, so the test coordinates read as the values they produce.
const SQUARE_PX = 100;
const HUE_PX = 360;

function stubRects() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const isHue = this.className.includes('hueSlider');
    const width = isHue ? HUE_PX : SQUARE_PX;
    const height = isHue ? 10 : SQUARE_PX;
    return {
      left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect;
  });
}

function surfaces() {
  const square = document.querySelector('[class*="svSquare"]') as HTMLElement;
  const hue = document.querySelector('[class*="hueSlider"]') as HTMLElement;
  const cursor = document.querySelector('[class*="svCursor"]') as HTMLElement;
  const hueCursor = document.querySelector('[class*="hueCursor"]') as HTMLElement;
  return { square, hue, cursor, hueCursor };
}

// setPointerCapture is not implemented in jsdom.
function down(el: HTMLElement, clientX: number, clientY: number) {
  el.setPointerCapture = () => {};
  fireEvent.pointerDown(el, { clientX, clientY, pointerId: 1 });
}

describe('HsvPicker', () => {
  beforeEach(stubRects);
  afterEach(() => vi.restoreAllMocks());

  it('keeps the hue after the color passes through the achromatic edges', () => {
    // The real surfaces feed the preview straight back in as `value`, which is
    // where hue is lost: every hex on the left or bottom edge is achromatic.
    function Host() {
      const [color, setColor] = useState('#17524b');
      return <HsvPicker value={color} onPreview={setColor} onCommit={setColor} />;
    }
    render(<Host />);
    const { square, hueCursor } = surfaces();
    const hueBefore = hueCursor.style.left;

    down(square, 50, 50);
    fireEvent.pointerMove(window, { clientX: 50, clientY: 100, pointerId: 1 }); // v = 0 -> #000000
    fireEvent.pointerUp(window, { clientX: 50, clientY: 100, pointerId: 1 });
    expect(hueCursor.style.left).toBe(hueBefore);

    // A fresh drag off the black edge must return to teal, not to red.
    down(square, 100, 0);
    expect(hueCursor.style.left).toBe(hueBefore);
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('#00FFE1');
  });

  it('places the SV cursor exactly where the pointer is, without hex round-trip drift', () => {
    render(<HsvPicker value="#17524b" onPreview={vi.fn()} onCommit={vi.fn()} />);
    const { square, cursor } = surfaces();

    down(square, 37, 81);
    expect(cursor.style.left).toBe('37%');
    expect(cursor.style.top).toBe('81%');
  });

  it('does not reset the position when the parent echoes the emitted hex back as value', () => {
    let committed = '';
    const { rerender } = render(
      <HsvPicker value="#17524b" onPreview={h => { committed = h; }} onCommit={vi.fn()} />,
    );
    const { square, cursor } = surfaces();

    down(square, 12, 97);
    rerender(<HsvPicker value={committed} onPreview={h => { committed = h; }} onCommit={vi.fn()} />);
    expect(cursor.style.left).toBe('12%');
    expect(cursor.style.top).toBe('97%');
  });

  it('commits once on pointerup and stops tracking afterwards', () => {
    const onCommit = vi.fn();
    const onPreview = vi.fn();
    render(<HsvPicker value="#17524b" onPreview={onPreview} onCommit={onCommit} />);
    const { square } = surfaces();

    down(square, 50, 50);
    fireEvent.pointerUp(window, { clientX: 50, clientY: 50, pointerId: 1 });
    expect(onCommit).toHaveBeenCalledTimes(1);

    onPreview.mockClear();
    fireEvent.pointerMove(window, { clientX: 90, clientY: 10, pointerId: 1 });
    expect(onPreview).not.toHaveBeenCalled();
  });

  it('dragging the hue slider preserves saturation and value', () => {
    const onPreview = vi.fn();
    render(<HsvPicker value="#804020" onPreview={onPreview} onCommit={vi.fn()} />);
    const { hue } = surfaces();

    down(hue, 180, 5); // hue 180
    const [hex] = onPreview.mock.calls.at(-1) as [string];
    // Same saturation and value as the start color, at the dragged hue.
    expect(hex).toBe('#208080');
  });

  it('does not commit when the picker unmounts mid-drag', () => {
    const onCommit = vi.fn();
    const { unmount } = render(
      <HsvPicker value="#17524b" onPreview={vi.fn()} onCommit={onCommit} />,
    );
    const { square } = surfaces();

    down(square, 50, 50);
    unmount();
    fireEvent.pointerUp(window, { clientX: 50, clientY: 50, pointerId: 1 });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('discards the gesture on pointercancel instead of committing it', () => {
    const onCommit = vi.fn();
    const onPreview = vi.fn();
    render(<HsvPicker value="#17524b" onPreview={onPreview} onCommit={onCommit} />);
    const { square, cursor } = surfaces();
    const startLeft = cursor.style.left;
    const startTop = cursor.style.top;

    down(square, 90, 10);
    expect(cursor.style.left).toBe('90%');
    fireEvent.pointerCancel(window, { clientX: 90, clientY: 10, pointerId: 1 });

    expect(onCommit).not.toHaveBeenCalled();
    expect(cursor.style.left).toBe(startLeft);
    expect(cursor.style.top).toBe(startTop);
    expect(onPreview).toHaveBeenLastCalledWith('#17524b');
  });

  it('keeps the hex field in step with the cursors when the host ignores the preview', () => {
    // A host that never echoes the emitted hex back (the light-mode panel
    // background writes a key the read path does not seed from) must not leave
    // the readout describing a color the square no longer shows.
    render(<HsvPicker value="#17524b" onPreview={vi.fn()} onCommit={vi.fn()} />);
    const { square } = surfaces();

    down(square, 100, 0);
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('#00FFE1');
  });

  it('adopts an external value change', () => {
    const { rerender } = render(<HsvPicker value="#17524b" onPreview={vi.fn()} onCommit={vi.fn()} />);
    rerender(<HsvPicker value="#ff0000" onPreview={vi.fn()} onCommit={vi.fn()} />);
    const { cursor } = surfaces();
    expect(cursor.style.left).toBe('100%');
    expect(cursor.style.top).toBe('0%');
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('#FF0000');
  });
});
