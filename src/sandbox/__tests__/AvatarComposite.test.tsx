// Preview-mode + I/O-safety guarantees for the `ui-avatar` blessed composite,
// mirroring how RemoteTree.test.tsx drives blessed elements through a real
// RemoteReceiver. ClockFace/WorldClock have no I/O to gate (see
// elementMap.test.ts for their generic drift coverage); ui-avatar is the
// first composite that fetches + renders, so it gets a dedicated test.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';
import { RemoteReceiver } from '@remote-dom/core/receivers';
import { ROOT_ID, NODE_TYPE_ELEMENT, MUTATION_TYPE_INSERT_CHILD } from '@remote-dom/core';
import { RemoteTree } from '../RemoteTree';
import { PanelPreviewProvider } from '../../panel/widgets/common/PanelPreviewContext';
import { PanelImmersiveProvider } from '../../panel/widgets/common/PanelImmersiveContext';

function avatarEl(id: string, properties: Record<string, unknown>) {
  return { id, type: NODE_TYPE_ELEMENT, element: 'ui-avatar', properties, attributes: {}, eventListeners: {}, children: [] };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AvatarComposite (ui-avatar)', () => {
  it('preview mode renders a static placeholder: no network, no canvas', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const receiver = new RemoteReceiver();
    const { container } = render(
      <PanelPreviewProvider value={true}>
        <RemoteTree receiver={receiver} />
      </PanelPreviewProvider>,
    );

    act(() => {
      receiver.connection.mutate([
        [MUTATION_TYPE_INSERT_CHILD, ROOT_ID, avatarEl('a1', { pack: '/packs/sample/' }), 0],
      ] as never);
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(container.querySelector('canvas')).toBeNull();
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('renders nothing when pack is missing outside preview (no provider needed)', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const receiver = new RemoteReceiver();
    const { container } = render(<RemoteTree receiver={receiver} />);

    act(() => {
      receiver.connection.mutate([
        [MUTATION_TYPE_INSERT_CHILD, ROOT_ID, avatarEl('a2', {}), 0],
      ] as never);
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(container.querySelector('canvas')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('shows a quiet inline error when the pack fails to load', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network down'))));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const receiver = new RemoteReceiver();
    render(<RemoteTree receiver={receiver} />);

    act(() => {
      receiver.connection.mutate([
        [MUTATION_TYPE_INSERT_CHILD, ROOT_ID, avatarEl('a3', { pack: '/packs/sample/' }), 0],
      ] as never);
    });

    await waitFor(() => expect(screen.getByText('sdk.avatar.loadError')).toBeTruthy());
    consoleErrorSpy.mockRestore();
  });

  // Tile mode is gesture-inert (a tap must fall through to the panel cell's
  // tap-to-immersive); only the immersive overlay's context enables gestures,
  // and with them the wrap claims its drags away from the overlay's
  // swipe-down dismiss via data-panel-no-sheet-swipe.
  it('claims gesture ownership only under the immersive context', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network down'))));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const tileReceiver = new RemoteReceiver();
    const tile = render(<RemoteTree receiver={tileReceiver} />);
    act(() => {
      tileReceiver.connection.mutate([
        [MUTATION_TYPE_INSERT_CHILD, ROOT_ID, avatarEl('a4', { pack: '/packs/tile/' }), 0],
      ] as never);
    });
    expect(tile.container.querySelector('[data-panel-no-sheet-swipe]')).toBeNull();
    const tileCanvas = tile.container.querySelector('canvas');
    expect(tileCanvas?.style.pointerEvents).toBe('none');

    const immersiveReceiver = new RemoteReceiver();
    const immersive = render(
      <PanelImmersiveProvider value={true}>
        <RemoteTree receiver={immersiveReceiver} />
      </PanelImmersiveProvider>,
    );
    act(() => {
      immersiveReceiver.connection.mutate([
        [MUTATION_TYPE_INSERT_CHILD, ROOT_ID, avatarEl('a5', { pack: '/packs/imm/' }), 0],
      ] as never);
    });
    expect(immersive.container.querySelector('[data-panel-no-sheet-swipe]')).toBeTruthy();
    const immersiveCanvas = immersive.container.querySelector('canvas');
    expect(immersiveCanvas?.style.pointerEvents).toBe('auto');

    // Both loads reject; drain them so no unhandled rejection escapes the test.
    await waitFor(() => expect(consoleErrorSpy).toHaveBeenCalled());
    consoleErrorSpy.mockRestore();
  });
});
