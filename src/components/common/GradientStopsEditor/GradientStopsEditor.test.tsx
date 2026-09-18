import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GradientStopsEditor } from './GradientStopsEditor';

const STOPS = [
  { at: 0, color: '#2563eb' },
  { at: 0.5, color: '#f59e0b' },
  { at: 1, color: '#ef4444' },
];

// jsdom lays nothing out; give the bar a 200px box so pointer x maps to a
// position (x / 200) and the handle hit test has something to measure.
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 32, width: 200, height: 32, toJSON: () => ({}),
  } as DOMRect);
});

function mount(overrides: Partial<Parameters<typeof GradientStopsEditor>[0]> = {}) {
  const onPreview = vi.fn();
  const onCommit = vi.fn();
  render(
    <GradientStopsEditor stops={STOPS} onPreview={onPreview} onCommit={onCommit} minStops={2} maxStops={5} {...overrides} />,
  );
  return { onPreview, onCommit, bar: screen.getByRole('group') };
}

describe('GradientStopsEditor', () => {
  it('adds a stop where an empty part of the bar is tapped, coloured as the bar is there', () => {
    const { onCommit, bar } = mount();
    fireEvent.pointerDown(bar, { clientX: 50, clientY: 16, button: 0, pointerId: 1 });
    expect(onCommit).toHaveBeenCalledTimes(1);
    const next = onCommit.mock.calls[0][0];
    expect(next).toHaveLength(4);
    expect(next[1]).toEqual({ at: 0.25, color: '#8d817b' });
  });

  it('refuses to add past the cap', () => {
    const { onCommit, bar } = mount({ maxStops: 3 });
    fireEvent.pointerDown(bar, { clientX: 50, clientY: 16, button: 0, pointerId: 1 });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('drags a handle along the bar, previewing live and committing on release', () => {
    const { onPreview, onCommit, bar } = mount();
    fireEvent.pointerDown(bar, { clientX: 100, clientY: 16, button: 0, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientX: 140, clientY: 16, pointerId: 1 });
    expect(onPreview).toHaveBeenLastCalledWith([STOPS[0], { at: 0.7, color: '#f59e0b' }, STOPS[2]]);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.pointerUp(bar, { clientX: 140, clientY: 16, pointerId: 1 });
    expect(onCommit).toHaveBeenCalledWith([STOPS[0], { at: 0.7, color: '#f59e0b' }, STOPS[2]]);
  });

  it('keeps a dragged handle between its neighbours', () => {
    const { onPreview, bar } = mount();
    fireEvent.pointerDown(bar, { clientX: 100, clientY: 16, button: 0, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientX: 400, clientY: 16, pointerId: 1 });
    expect(onPreview.mock.calls.at(-1)?.[0][1].at).toBeCloseTo(0.98);
  });

  it('removes a handle dragged out past either end of the bar', () => {
    const { onCommit, bar } = mount();
    fireEvent.pointerDown(bar, { clientX: 100, clientY: 16, button: 0, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientX: 260, clientY: 16, pointerId: 1 });
    fireEvent.pointerUp(bar, { clientX: 260, clientY: 16, pointerId: 1 });
    expect(onCommit).toHaveBeenCalledWith([STOPS[0], STOPS[2]]);
  });

  it('a drag to the very end of the bar is a move, not a removal', () => {
    const { onCommit, bar } = mount();
    fireEvent.pointerDown(bar, { clientX: 100, clientY: 16, button: 0, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientX: 215, clientY: 16, pointerId: 1 });
    fireEvent.pointerUp(bar, { clientX: 215, clientY: 16, pointerId: 1 });
    expect(onCommit.mock.calls.at(-1)?.[0]).toHaveLength(3);
  });

  it('never removes below the minimum: the drag is just a move', () => {
    const { onCommit, bar } = mount({ stops: [STOPS[0], STOPS[2]] });
    fireEvent.pointerDown(bar, { clientX: 0, clientY: 16, button: 0, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientX: -120, clientY: 16, pointerId: 1 });
    fireEvent.pointerUp(bar, { clientX: -120, clientY: 16, pointerId: 1 });
    expect(onCommit.mock.calls.at(-1)?.[0]).toHaveLength(2);
  });

  it('keeps the palette in place but inert until a handle is tapped, then recolours through it', () => {
    const { onCommit, bar } = mount();
    const swatch = screen.getByRole('button', { name: '#ef4444' });
    expect(swatch).toBeDisabled();
    fireEvent.click(swatch);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.pointerDown(bar, { clientX: 100, clientY: 16, button: 0, pointerId: 1 });
    fireEvent.pointerUp(bar, { clientX: 100, clientY: 16, pointerId: 1 });
    expect(swatch).toBeEnabled();
    fireEvent.click(swatch);
    expect(onCommit).toHaveBeenCalledWith([STOPS[0], { at: 0.5, color: '#ef4444' }, STOPS[2]]);
  });

  it('exposes every handle as a labelled button', () => {
    mount();
    // No I18nProvider here, so t() hands back the key.
    expect(screen.getAllByRole('button', { name: 'gradientEditor.stop' })).toHaveLength(3);
  });
});
