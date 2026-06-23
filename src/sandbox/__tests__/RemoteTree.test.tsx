// Exercises the owned host renderer against a real @remote-dom RemoteReceiver,
// feeding it the same mutation records a worker would emit. Proves: blessed
// elements render their host components, text nodes render, unknown elements
// render nothing (the consistency boundary), and event listeners fire back.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { RemoteReceiver } from '@remote-dom/core/receivers';
import {
  ROOT_ID, NODE_TYPE_ELEMENT, NODE_TYPE_TEXT,
  MUTATION_TYPE_INSERT_CHILD, MUTATION_TYPE_UPDATE_PROPERTY,
} from '@remote-dom/core';
import { RemoteTree } from '../RemoteTree';

function el(
  id: string, element: string, properties: Record<string, unknown>,
  children: unknown[] = [], eventListeners: Record<string, unknown> = {},
) {
  return { id, type: NODE_TYPE_ELEMENT, element, properties, attributes: {}, eventListeners, children };
}
function text(id: string, data: string) {
  return { id, type: NODE_TYPE_TEXT, data };
}

afterEach(() => cleanup());

describe('RemoteTree host renderer', () => {
  it('renders blessed elements + text from worker mutations', () => {
    const receiver = new RemoteReceiver();
    render(<RemoteTree receiver={receiver} />);

    act(() => {
      receiver.connection.mutate([
        [MUTATION_TYPE_INSERT_CHILD, ROOT_ID,
          el('s1', 'ui-stack', { direction: 'column' }, [
            el('t1', 'ui-text', { value: '00:42' }),
            el('t2', 'ui-text', {}, [text('x1', 'label')]),
          ]),
          0],
      ] as never);
    });

    expect(screen.getByText('00:42')).toBeTruthy();
    expect(screen.getByText('label')).toBeTruthy();
  });

  it('renders nothing for an element name not in the map (consistency boundary)', () => {
    const receiver = new RemoteReceiver();
    const { container } = render(<RemoteTree receiver={receiver} />);
    act(() => {
      receiver.connection.mutate([
        [MUTATION_TYPE_INSERT_CHILD, ROOT_ID, el('e1', 'div', { dangerous: true }, [text('t', 'XSS')]), 0],
      ] as never);
    });
    expect(container.textContent ?? '').not.toContain('XSS');
  });

  it('fires an event listener back to the worker', () => {
    const receiver = new RemoteReceiver();
    const onPress = vi.fn();
    render(<RemoteTree receiver={receiver} />);
    act(() => {
      receiver.connection.mutate([
        [MUTATION_TYPE_INSERT_CHILD, ROOT_ID, el('b1', 'ui-button', { label: 'Go' }, [], { press: onPress }), 0],
      ] as never);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders the spinner as an SVG loading indicator', () => {
    const receiver = new RemoteReceiver();
    render(<RemoteTree receiver={receiver} />);
    act(() => {
      receiver.connection.mutate([
        [MUTATION_TYPE_INSERT_CHILD, ROOT_ID, el('sp1', 'ui-spinner', { size: 24 }), 0],
      ] as never);
    });
    expect(screen.getByRole('img', { name: 'common.loading' })).toBeTruthy();
  });

  it('renders the gauge as a labelled arc meter', () => {
    const receiver = new RemoteReceiver();
    render(<RemoteTree receiver={receiver} />);
    act(() => {
      receiver.connection.mutate([
        [MUTATION_TYPE_INSERT_CHILD, ROOT_ID, el('g1', 'ui-gauge', { value: 60, label: '60%' }), 0],
      ] as never);
    });
    expect(screen.getByRole('img', { name: '60%' })).toBeTruthy();
    expect(screen.getByText('60%')).toBeTruthy();
  });

  it('renders the colour picker and fires change with the committed hex', () => {
    const receiver = new RemoteReceiver();
    const onChange = vi.fn();
    render(<RemoteTree receiver={receiver} />);
    act(() => {
      receiver.connection.mutate([
        [MUTATION_TYPE_INSERT_CHILD, ROOT_ID, el('c1', 'ui-color', { value: '#112233' }, [], { change: onChange }), 0],
      ] as never);
    });
    // The native HSV picker's hex field commits on a valid entry.
    fireEvent.change(screen.getByLabelText('common.hexColor'), { target: { value: '#ff8800' } });
    expect(onChange).toHaveBeenCalledWith('#ff8800');
  });

  it('renders the curve editor with a node per point', () => {
    const receiver = new RemoteReceiver();
    const { container } = render(<RemoteTree receiver={receiver} />);
    act(() => {
      receiver.connection.mutate([
        [MUTATION_TYPE_INSERT_CHILD, ROOT_ID,
          el('cv1', 'ui-curve',
            { points: [{ x: 30, y: 20 }, { x: 60, y: 60 }, { x: 90, y: 100 }], xmin: 20, xmax: 100, ymin: 0, ymax: 100 },
            [], { change: vi.fn() }),
          0],
      ] as never);
    });
    expect(container.querySelectorAll('circle').length).toBe(3);
  });

  it('fires longpress on a held button press and suppresses the trailing click', () => {
    vi.useFakeTimers();
    const receiver = new RemoteReceiver();
    const onPress = vi.fn(); const onLong = vi.fn();
    render(<RemoteTree receiver={receiver} />);
    act(() => {
      receiver.connection.mutate([
        [MUTATION_TYPE_INSERT_CHILD, ROOT_ID, el('b2', 'ui-button', { label: 'Hold' }, [], { press: onPress, longpress: onLong }), 0],
      ] as never);
    });
    const btn = screen.getByRole('button', { name: 'Hold' });
    fireEvent.pointerDown(btn);
    act(() => { vi.advanceTimersByTime(500); });
    fireEvent.pointerUp(btn);
    fireEvent.click(btn);
    expect(onLong).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('fires press (not longpress) on a quick button tap', () => {
    vi.useFakeTimers();
    const receiver = new RemoteReceiver();
    const onPress = vi.fn(); const onLong = vi.fn();
    render(<RemoteTree receiver={receiver} />);
    act(() => {
      receiver.connection.mutate([
        [MUTATION_TYPE_INSERT_CHILD, ROOT_ID, el('b3', 'ui-button', { label: 'Tap' }, [], { press: onPress, longpress: onLong }), 0],
      ] as never);
    });
    const btn = screen.getByRole('button', { name: 'Tap' });
    fireEvent.pointerDown(btn);
    act(() => { vi.advanceTimersByTime(100); });
    fireEvent.pointerUp(btn);
    fireEvent.click(btn);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onLong).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('updates a property in place on a later mutation', () => {
    const receiver = new RemoteReceiver();
    render(<RemoteTree receiver={receiver} />);
    act(() => {
      receiver.connection.mutate([
        [MUTATION_TYPE_INSERT_CHILD, ROOT_ID, el('t1', 'ui-text', { value: 'A' }), 0],
      ] as never);
    });
    expect(screen.getByText('A')).toBeTruthy();
    act(() => {
      receiver.connection.mutate([
        [MUTATION_TYPE_UPDATE_PROPERTY, 't1', 'value', 'B'],
      ] as never);
    });
    expect(screen.getByText('B')).toBeTruthy();
  });
});
