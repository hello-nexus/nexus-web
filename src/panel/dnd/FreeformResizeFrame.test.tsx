import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { FreeformResizeFrame } from './FreeformResizeFrame';
import type { PanelWidget } from '../types';

vi.mock('../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../engine/panelLayoutHelpers', () => ({
  readCellMetrics: () => ({ cellSize: 90, rowSize: 40, gap: 10 }),
}));

const ROOM = { tl: true, tr: false, bl: true, br: false };
const widget: PanelWidget = { id: 'w1', type: 'web-view', size: '6x4', col: 1, row: 2 };

beforeAll(() => {
  Element.prototype.setPointerCapture = vi.fn();
});

function setup() {
  const onBegin = vi.fn(() => true);
  const onUpdate = vi.fn();
  const onEnd = vi.fn();
  const onExit = vi.fn();
  const { container } = render(
    <div data-surface="y70">
      <FreeformResizeFrame widget={widget} label="Web View" room={ROOM} onBegin={onBegin} onUpdate={onUpdate} onEnd={onEnd} onExit={onExit} />
    </div>,
  );
  return { onBegin, onUpdate, onEnd, onExit, container };
}

const press = (el: Element, x: number, y: number) => fireEvent.pointerDown(el, { clientX: x, clientY: y, pointerId: 1, button: 0, pointerType: 'mouse' });
const move = (el: Element, x: number, y: number) => fireEvent.pointerMove(el, { clientX: x, clientY: y, pointerId: 1 });
const release = (el: Element, x: number, y: number) => fireEvent.pointerUp(el, { clientX: x, clientY: y, pointerId: 1 });

describe('FreeformResizeFrame', () => {
  it('places the frame on the widget rect and exposes four labelled handles', () => {
    const { container } = setup();
    const frame = container.querySelector<HTMLElement>('[data-freeform-frame]')!;
    expect(frame.style.gridColumn).toBe('2 / span 6');
    expect(frame.style.gridRow).toBe('3 / span 4');
    for (const key of ['topLeft', 'topRight', 'bottomLeft', 'bottomRight']) {
      expect(screen.getByRole('button', { name: `panel.freeform.handle.${key}` })).toBeInTheDocument();
    }
  });

  it('marks corners without room and keeps them draggable inward', () => {
    const { onUpdate } = setup();
    const tr = screen.getByRole('button', { name: 'panel.freeform.handle.topRight' });
    expect(tr).toHaveAttribute('data-room', 'false');
    expect(screen.getByRole('button', { name: 'panel.freeform.handle.topLeft' })).toHaveAttribute('data-room', 'true');
    press(tr, 0, 0);
    move(tr, -100, 50);
    expect(onUpdate).toHaveBeenLastCalledWith('tr', -1, 1);
  });

  it('flags a touch frame so its grab areas grow', () => {
    const { container } = render(
      <div data-surface="y70">
        <FreeformResizeFrame widget={widget} label="Web View" room={ROOM} touch onBegin={vi.fn(() => true)} onUpdate={vi.fn()} onEnd={vi.fn()} onExit={vi.fn()} />
      </div>,
    );
    expect(container.querySelector('[data-freeform-frame]')).toHaveAttribute('data-touch', 'true');
  });

  it('exits on a body tap and not on a body drag', () => {
    const { onBegin, onUpdate, onEnd, onExit } = setup();
    const body = screen.getByRole('button', { name: 'panel.freeform.body' });

    press(body, 100, 100);
    release(body, 101, 100);
    expect(onBegin).toHaveBeenCalledTimes(1);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledTimes(1);

    press(body, 100, 100);
    move(body, 200, 160);
    release(body, 200, 160);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('reports a body drag as a move in cells', () => {
    const { onUpdate } = setup();
    const body = screen.getByRole('button', { name: 'panel.freeform.body' });
    press(body, 0, 0);
    move(body, 200, 100);
    expect(onUpdate).toHaveBeenLastCalledWith('move', 2, 2);
  });

  it('reports a corner drag with the corner and the cell delta', () => {
    const { onUpdate, onEnd, onExit } = setup();
    const handle = screen.getByRole('button', { name: 'panel.freeform.handle.topLeft' });
    press(handle, 50, 50);
    move(handle, 50 - 100, 50 + 50);
    release(handle, -50, 100);
    expect(onUpdate).toHaveBeenLastCalledWith('tl', -1, 1);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onExit).not.toHaveBeenCalled();
  });

  it('does not start a gesture when the widget is gone', () => {
    const onBegin = vi.fn(() => false);
    const onUpdate = vi.fn();
    render(
      <div data-surface="y70">
        <FreeformResizeFrame widget={widget} label="Web View" room={ROOM} onBegin={onBegin} onUpdate={onUpdate} onEnd={vi.fn()} onExit={vi.fn()} />
      </div>,
    );
    const handle = screen.getByRole('button', { name: 'panel.freeform.handle.bottomRight' });
    press(handle, 0, 0);
    move(handle, 100, 100);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('steps a corner by one cell with the arrow keys', () => {
    const { onBegin, onUpdate, onEnd } = setup();
    const handle = screen.getByRole('button', { name: 'panel.freeform.handle.bottomRight' });
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(onBegin).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith('br', 1, 0);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('exits from the keyboard', () => {
    const { onExit } = setup();
    const body = screen.getByRole('button', { name: 'panel.freeform.body' });
    expect(body).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(body, { key: 'Enter' });
    fireEvent.keyDown(body, { key: ' ' });
    fireEvent.keyDown(body, { key: 'Escape' });
    expect(onExit).toHaveBeenCalledTimes(3);
  });
});
