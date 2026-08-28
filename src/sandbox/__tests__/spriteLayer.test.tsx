// Covers the two elements that give the closed layout set free 2D placement:
// ui-layer (a positioned, tappable stage) and ui-sprite (one cell of an atlas).
// The atlas crosses the boundary as a CSS url(), so the injection guard is the
// security-relevant case here, alongside the frame -> background-position math.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { Layer, Sprite } from '../ui/components';

afterEach(() => cleanup());

const ATLAS = 'data:image/webp;base64,UklGRhYAAABXRUJQ';

function sprite(props: Record<string, unknown>) {
  const { container } = render(<Sprite src={ATLAS} {...props} />);
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

  it('places and scales with a transform, and flips on the x axis only', () => {
    const el = sprite({ x: 40, y: 12, scale: 2, flip: true });
    expect(el?.style.transform).toBe('translate3d(40px, 12px, 0) scale(-2, 2)');
    expect(el?.style.position).toBe('absolute');
  });

  it('defaults to nearest-neighbour scaling so pixel art stays crisp', () => {
    expect(sprite({})?.style.imageRendering).toBe('pixelated');
    expect(sprite({ pixelated: false })?.style.imageRendering).toBe('');
  });

  it('renders nothing for a src that is not an allowed scheme', () => {
    const { container } = render(<Sprite src="http://evil.test/a.png" />);
    expect(container.firstElementChild).toBeNull();
  });

  it('rejects a src that could break out of the CSS url() token', () => {
    // Each of these would otherwise let an author append their own declaration.
    for (const bad of [
      'data:image/png;base64,AA") ; background: url("http://evil.test/x.png',
      "data:image/png;base64,AA') ;color:red;(",
      'data:image/png;base64,AA\\22 ',
      'data:image/png;base64,AA B',
    ]) {
      const { container } = render(<Sprite src={bad} />);
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
