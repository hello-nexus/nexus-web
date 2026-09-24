// The `ui-avatar` camera hooks an app control can use: the `zoom` prop drives
// the session, and canvas gestures report `zoom` and `interaction` events.
// The three.js session is mocked so no WebGL context is needed.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { PanelImmersiveProvider } from '../../panel/widgets/common/PanelImmersiveContext';

const setZoom = vi.fn();
vi.mock('../ui/avatarSession', () => ({
  createAvatarSession: vi.fn(async () => ({
    resize: () => {}, tick: () => {}, handleSignal: () => {}, triggerReaction: () => {},
    setDemo: () => {}, startIntro: () => {}, getZoom: () => 0.5, setZoom: (f: number) => setZoom(f), dispose: () => {},
  })),
}));
vi.mock('../../api/auth', () => ({ getToken: async () => 'tok', getTokenSync: () => 'tok' }));

import { AvatarComposite } from '../ui/AvatarComposite';

afterEach(() => { cleanup(); setZoom.mockClear(); });

describe('ui-avatar zoom and interaction', () => {
  it('the zoom prop drives the camera on the stage, and gestures report zoom and interaction', async () => {
    const zoom = vi.fn();
    const interaction = vi.fn();
    const view = render(
      <PanelImmersiveProvider value={true}>
        <AvatarComposite pack="/packs/z1/" zoom={0.8} __events={{ zoom, interaction }} />
      </PanelImmersiveProvider>,
    );
    await waitFor(() => expect(view.container.querySelector('canvas')).toBeTruthy());
    await waitFor(() => expect(setZoom).toHaveBeenCalledWith(0.8));
    const wrap = view.container.querySelector('[data-panel-no-sheet-swipe]')!;
    fireEvent.pointerDown(wrap);
    expect(interaction).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(wrap);
    expect(zoom).toHaveBeenCalledWith(0.5);
  });

  it('a tile applies zoom (it holds the canvas) but reports no gestures', async () => {
    const interaction = vi.fn();
    const view = render(<AvatarComposite pack="/packs/z2/" zoom={0.3} __events={{ interaction }} />);
    await waitFor(() => expect(view.container.querySelector('canvas')).toBeTruthy());
    await waitFor(() => expect(setZoom).toHaveBeenCalledWith(0.3));
    fireEvent.pointerDown(view.container.firstElementChild!);
    expect(interaction).not.toHaveBeenCalled();
  });
});
