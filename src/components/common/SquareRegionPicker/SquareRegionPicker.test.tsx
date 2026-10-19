import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SquareRegionPicker } from './SquareRegionPicker';

const WIDE = 16 / 9;

function setup(region = { x: 0, y: 0, size: 0 }) {
  const onPreview = vi.fn();
  const onCommit = vi.fn();
  const { container } = render(
    <SquareRegionPicker aspect={WIDE} region={region} ariaLabel="Region" onPreview={onPreview} onCommit={onCommit}>
      <span>picture</span>
    </SquareRegionPicker>,
  );
  const stage = container.firstElementChild as HTMLElement;
  stage.getBoundingClientRect = () => ({ width: 400, height: 225, left: 0, top: 0, right: 400, bottom: 225, x: 0, y: 0, toJSON: () => ({}) });
  return { onPreview, onCommit, handle: screen.getByRole('slider', { name: 'Region' }) };
}

describe('SquareRegionPicker', () => {
  it('draws the largest centered square by default, under the picture', () => {
    const { handle } = setup();
    expect(screen.getByText('picture')).toBeInTheDocument();
    expect(handle.style.height).toBe('100%');
    expect(parseFloat(handle.style.width)).toBeCloseTo(56.25);
    expect(parseFloat(handle.style.left)).toBeCloseTo(21.875);
  });

  it('is a focusable slider that moves with the arrow keys and commits each step', () => {
    const { handle, onCommit } = setup({ x: 0.2, y: 0.1, size: 0.5 });
    expect(handle).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(onCommit.mock.calls[0][0].x).toBeCloseTo(0.21);
    fireEvent.keyDown(handle, { key: 'ArrowDown', shiftKey: true });
    expect(onCommit.mock.calls[1][0].y).toBeCloseTo(0.15);
    fireEvent.keyDown(handle, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledTimes(2);
  });

  it('drags: previews while moving and commits once on release', () => {
    const { handle, onPreview, onCommit } = setup({ x: 0.1, y: 0.1, size: 0.4 });
    fireEvent.pointerDown(handle, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 140, clientY: 100, pointerId: 1 });
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onPreview.mock.calls[0][0].x).toBeCloseTo(0.2);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][0].x).toBeCloseTo(0.2);
  });

  it('keeps the square on the display when dragged past the edge', () => {
    const { handle, onCommit } = setup({ x: 0.1, y: 0.1, size: 0.4 });
    fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: -4000, clientY: -4000, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(onCommit.mock.calls[0][0]).toMatchObject({ x: 0, y: 0 });
  });

  it('ignores a move that never started with a press', () => {
    const { handle, onPreview, onCommit } = setup();
    fireEvent.pointerMove(handle, { clientX: 10, clientY: 10 });
    fireEvent.pointerUp(handle);
    expect(onPreview).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });
});
