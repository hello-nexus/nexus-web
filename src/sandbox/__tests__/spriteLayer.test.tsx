// Covers the two elements that give the closed layout set free 2D placement:
// ui-layer (a positioned, tappable stage) and ui-sprite (one cell of an atlas).
// The atlas crosses the boundary as a CSS url(), so the injection guard is the
// security-relevant case here, alongside the frame -> background-position math.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { Sprite } from '../ui/components';
import { Layer } from '../ui/LayerStage';

afterEach(() => cleanup());

const ATLAS = 'data:image/webp;base64,UklGRhYAAABXRUJQ';

function sprite(props: Record<string, unknown>) {
  // x/y default in: an unpositioned sprite deliberately renders nothing.
  const { container } = render(<Sprite src={ATLAS} x={0} y={0} {...props} />);
  return container.firstElementChild as HTMLElement | null;
}

describe('ui-sprite', () => {
  it('maps a frame index to the right atlas cell', () => {
    // 12-wide atlas: frame 14 is row 1, column 2.
    const el = sprite({ frame: 14, cols: 12, cw: 32, ch: 32 });
    expect(el?.style.backgroundPosition).toBe('-64px -32px');
    expect(el?.style.width).toBe('32px');
    expect(el?.style.height).toBe('32px');
  });

  it('wraps a frame past the end of the atlas row', () => {
    const el = sprite({ frame: 12, cols: 12, cw: 16, ch: 16 });
    expect(el?.style.backgroundPosition).toBe('0px -16px');
  });

  it('paints at its final size, where a cell scaled about its centre would sit, and flips on the x axis only', () => {
    const el = sprite({ x: 40, y: 12, scale: 2, flip: true });
    // The default cell scaled about its centre grows by half its size on each side.
    expect(el?.style.transform).toBe('translate3d(24px, -4px, 0) scaleX(-1)');
    expect([el?.style.width, el?.style.height]).toEqual(['64px', '64px']);
    expect(el?.style.position).toBe('absolute');
  });

  it('scales the atlas with the cell, so the browser draws its pixels nearest-neighbour at full size', () => {
    const el = sprite({ frame: 14, cols: 12, cw: 16, ch: 16, scale: 3 });
    expect(el?.style.backgroundSize).toMatch(/^576px( auto)?$/);
    expect(el?.style.backgroundPosition).toBe('-96px -48px');
  });

  it('keeps showing its old image while a new one decodes, so a redrawn bitmap never blinks', async () => {
    let finish = () => {};
    // jsdom has no decode(); stand one in that resolves when the test says so.
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true, value: () => new Promise<void>((r) => { finish = r; }),
    });
    try {
      const next = 'data:image/png;base64,iVBORw0KGgo';
      const { container, rerender } = render(<Sprite src={ATLAS} x={0} y={0} cw={16} ch={16} cols={4} frame={1} scale={2} />);
      rerender(<Sprite src={next} x={0} y={0} cw={24} ch={24} cols={2} frame={0} scale={2} />);
      const el = () => container.firstElementChild as HTMLElement;
      // The old image keeps the whole cell it was drawn with: box, atlas size and offset.
      expect(el().style.backgroundImage).toContain(ATLAS);
      expect([el().style.width, el().style.backgroundSize, el().style.backgroundPosition]).toEqual(['32px', '128px', '-32px 0px']);
      await act(async () => { finish(); });
      expect(el().style.backgroundImage).toContain(next);
      expect(el().style.width).toBe('48px');
    } finally {
      delete (HTMLImageElement.prototype as { decode?: unknown }).decode;
    }
  });

  it('gives up holding on time even when the source keeps changing before any decodes', () => {
    vi.useFakeTimers();
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true, value: () => new Promise<void>(() => {}),
    });
    try {
      const { container, rerender } = render(<Sprite src={ATLAS} x={0} y={0} />);
      const el = () => container.firstElementChild as HTMLElement;
      for (let i = 0; i < 10; i++) {
        rerender(<Sprite src={`data:image/png;base64,QUFB${i}`} x={0} y={0} />);
        act(() => { vi.advanceTimersByTime(100); });
      }
      expect(el().style.backgroundImage).not.toContain(ATLAS);
    } finally {
      delete (HTMLImageElement.prototype as { decode?: unknown }).decode;
      vi.useRealTimers();
    }
  });

  it('defaults to nearest-neighbour scaling so pixel art stays crisp', () => {
    expect(sprite({})?.style.imageRendering).toBe('pixelated');
    expect(sprite({ pixelated: false })?.style.imageRendering).toBe('');
  });

  it('renders nothing for a src that is not an allowed scheme', () => {
    const { container } = render(<Sprite src="http://evil.test/a.png" x={0} y={0} />);
    expect(container.firstElementChild).toBeNull();
  });

  it('does not paint before it has a position, so a new sprite cannot flash at the origin', () => {
    const { container } = render(<Sprite src={ATLAS} frame={3} cols={12} />);
    expect(container.firstElementChild).toBeNull();
  });

  it('paints at the origin when the origin is what the author asked for', () => {
    const { container } = render(<Sprite src={ATLAS} x={0} y={0} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.transform).toBe('translate3d(0px, 0px, 0)');
  });

  it('rejects a src that could break out of the CSS url() token', () => {
    // Each of these would otherwise let an author append their own declaration.
    for (const bad of [
      'data:image/png;base64,AA") ; background: url("http://evil.test/x.png',
      "data:image/png;base64,AA') ;color:red;(",
      'data:image/png;base64,AA\\22 ',
      'data:image/png;base64,AA B',
    ]) {
      const { container } = render(<Sprite src={bad} x={0} y={0} />);
      expect(container.firstElementChild, bad).toBeNull();
      cleanup();
    }
  });
});

describe('ui-layer', () => {
  it('is a clipped positioned stage so sprites can overlap inside it', () => {
    const { container } = render(<Layer grow />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.position).toBe('relative');
    expect(el.style.overflow).toBe('hidden');
  });

  it('reports the tap position in layer-local pixels', () => {
    const press = vi.fn();
    const { container } = render(<Layer interactive __events={{ press }} />);
    const el = container.firstElementChild as HTMLElement;
    el.getBoundingClientRect = () =>
      ({ left: 100, top: 50, width: 200, height: 120 }) as DOMRect;

    fireEvent.click(el, { clientX: 130, clientY: 90 });

    expect(press).toHaveBeenCalledWith({ x: 30, y: 40 });
  });

  it('does not fire a press when it is not interactive', () => {
    const press = vi.fn();
    const { container } = render(<Layer __events={{ press }} />);
    fireEvent.click(container.firstElementChild as HTMLElement);
    expect(press).not.toHaveBeenCalled();
  });
});
