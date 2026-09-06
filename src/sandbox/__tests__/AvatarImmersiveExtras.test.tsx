// The immersive-only extras of the `ui-avatar` composite: the immersive
// event, the controls drawer (open on entry, idle fold, lip, Live pop-up,
// zoom, exit) and sticker mode (palette add -> placements event, remove).
// The three.js session is mocked so no WebGL context is needed; the
// composite is rendered directly with the synced-prop shape RemoteTree hands it.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent, act } from '@testing-library/react';
import { PanelImmersiveProvider } from '../../panel/widgets/common/PanelImmersiveContext';
import { ImmersiveExitProvider } from '../../panel/overlays/immersiveExit';

const setZoom = vi.fn();
vi.mock('../ui/avatarSession', () => ({
  createAvatarSession: vi.fn(async () => ({
    resize: () => {},
    tick: () => {},
    handleSignal: () => {},
    triggerReaction: () => {},
    setDemo: () => {},
    startIntro: () => {},
    getZoom: () => 0.5,
    setZoom: (f: number) => setZoom(f),
    dispose: () => {},
  })),
}));
vi.mock('../../api/service', () => ({ postService: vi.fn(async () => ({ error: false, msg: '' })) }));
vi.mock('../../api/auth', () => ({ getToken: async () => 'tok', getTokenSync: () => 'tok' }));

import { AvatarComposite, DRAWER_IDLE_MS } from '../ui/AvatarComposite';
import { postService } from '../../api/service';

const STICKERS = [{ id: 'star', src: '/apps-api/installed/com.x.y/asset/assets/stickers/star.png' }];
const STREAM = { embed: 'https://www.youtube-nocookie.com/embed/abc123def45?autoplay=1', open: 'https://www.youtube.com/watch?v=abc123def45', label: 'Watch' };

function renderImmersive(props: Record<string, unknown>, events: Record<string, (...a: unknown[]) => void> = {}) {
  return render(
    <PanelImmersiveProvider value={true}>
      <AvatarComposite pack={`/packs/${Math.random().toString(36).slice(2)}/`} {...props} __events={events} />
    </PanelImmersiveProvider>,
  );
}

async function ready(container: HTMLElement) {
  await waitFor(() => expect(container.querySelector('canvas')).toBeTruthy());
  // The drawer mounts once the session is ready.
  await waitFor(() => expect(container.querySelector('[data-avatar-dock]')).toBeTruthy());
}

beforeEach(() => {
  vi.mocked(postService).mockClear();
  setZoom.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ui-avatar immersive extras', () => {
  it('fires immersive true on taking the stage and false on leaving it; a tile never fires', async () => {
    const immersive = vi.fn();
    const view = renderImmersive({ status: 'x' }, { immersive });
    await ready(view.container);
    expect(immersive).toHaveBeenCalledWith(true);
    view.unmount();
    expect(immersive).toHaveBeenLastCalledWith(false);

    const tileEvents = vi.fn();
    const tile = render(<AvatarComposite pack="/packs/tile/" __events={{ immersive: tileEvents }} />);
    await waitFor(() => expect(tile.container.querySelector('canvas')).toBeTruthy());
    expect(tileEvents).not.toHaveBeenCalled();
  });

  it('renders the status strip with its live dot, and no dock at all in a tile', async () => {
    const view = renderImmersive({ status: 'On air', statusLive: true });
    await ready(view.container);
    const strip = view.container.querySelector('[data-avatar-status]')!;
    expect(strip.textContent).toBe('On air');
    expect(strip.querySelectorAll('span')).toHaveLength(2);

    const tile = render(<AvatarComposite pack="/packs/tile2/" status="On air" stream={STREAM} stickers={STICKERS} />);
    await waitFor(() => expect(tile.container.querySelector('canvas')).toBeTruthy());
    expect(tile.container.querySelector('[data-avatar-dock]')).toBeNull();
    expect(tile.container.querySelector('[data-avatar-stickers]')).toBeNull();
  });

  it('Live pops an allowlisted stream with an open button that goes through the service; a refused host reads as offline', async () => {
    const view = renderImmersive({ stream: STREAM });
    await ready(view.container);
    expect(screen.queryByRole('button', { name: 'Watch' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'sdk.avatar.live' }));
    // jsdom has no layout: the player box waits on a measured width, but the
    // open button renders regardless.
    fireEvent.click(screen.getByRole('button', { name: 'Watch' }));
    await waitFor(() => expect(postService).toHaveBeenCalledWith('/system/open-url', { url: STREAM.open }));
    // Live again folds the pop-up.
    fireEvent.click(screen.getByRole('button', { name: 'sdk.avatar.live' }));
    expect(screen.queryByRole('button', { name: 'Watch' })).toBeNull();
    cleanup();

    const livecheck = vi.fn();
    const other = renderImmersive({ stream: { embed: 'https://evil.example/embed/abc123def45', open: 'https://evil.example/' }, offlineArt: 'data:image/png;base64,AA' }, { livecheck });
    await ready(other.container);
    fireEvent.click(screen.getByRole('button', { name: 'sdk.avatar.live' }));
    expect(livecheck).toHaveBeenCalledTimes(1);
    expect(other.container.querySelector('[data-avatar-stream]')).toBeNull();
    const idle = other.container.querySelector('[data-avatar-idle]')!;
    expect(idle.textContent).toContain('sdk.avatar.notLive');
    expect(idle.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AA');
  });

  it('the drawer opens on entry, folds to its lip after the idle spell, and a touch on the stage restarts the clock', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const view = renderImmersive({});
    await ready(view.container);
    const drawer = () => view.container.querySelector('[data-avatar-dock]')!.getAttribute('data-avatar-drawer');
    expect(drawer()).toBe('open');
    // Stage activity just before the deadline keeps it open past it.
    await act(async () => { vi.advanceTimersByTime(DRAWER_IDLE_MS - 1000); });
    fireEvent.pointerDown(view.container.querySelector('canvas')!);
    await act(async () => { vi.advanceTimersByTime(DRAWER_IDLE_MS - 1000); });
    expect(drawer()).toBe('open');
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(drawer()).toBe('closed');
    // The lip brings it back; its own chevron folds it again.
    fireEvent.click(screen.getByRole('button', { name: 'sdk.avatar.controlsShow' }));
    expect(drawer()).toBe('open');
    fireEvent.click(screen.getByRole('button', { name: 'sdk.avatar.controlsHide' }));
    expect(drawer()).toBe('closed');
  });

  it('a playing stream holds the drawer open past the idle spell; the chevron then folds both', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const view = renderImmersive({ stream: STREAM });
    await ready(view.container);
    fireEvent.click(screen.getByRole('button', { name: 'sdk.avatar.live' }));
    expect(screen.getByRole('button', { name: 'Watch' })).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(DRAWER_IDLE_MS * 2); });
    const drawer = () => view.container.querySelector('[data-avatar-dock]')!.getAttribute('data-avatar-drawer');
    expect(drawer()).toBe('open');
    fireEvent.click(screen.getByRole('button', { name: 'sdk.avatar.controlsHide' }));
    expect(drawer()).toBe('closed');
    expect(screen.queryByRole('button', { name: 'Watch' })).toBeNull();
  });

  it('exits through the overlay provider, and the zoom slider drives the camera', async () => {
    const exit = vi.fn();
    const view = render(
      <ImmersiveExitProvider value={exit}>
        <PanelImmersiveProvider value={true}>
          <AvatarComposite pack="/packs/exit/" __events={{}} />
        </PanelImmersiveProvider>
      </ImmersiveExitProvider>,
    );
    await ready(view.container);
    fireEvent.click(screen.getByRole('button', { name: 'panel.immersive.close' }));
    expect(exit).toHaveBeenCalledTimes(1);
    // The zoom row needs the seed effect's commit after the drawer mounts.
    await waitFor(() => expect(view.container.querySelector('[data-avatar-zoom] input[type="range"]')).toBeTruthy());
    const slider = view.container.querySelector('[data-avatar-zoom] input[type="range"]') as HTMLInputElement;
    // Seeded from the session's resting zoom.
    expect(slider.value).toBe('50');
    fireEvent.change(slider, { target: { value: '80' } });
    expect(setZoom).toHaveBeenLastCalledWith(0.8);
  });

  it('sticker mode adds from the palette and reports the whole set; remove reports it empty', async () => {
    const placements = vi.fn();
    const view = renderImmersive({ stickers: STICKERS, placements: [] }, { placements });
    await ready(view.container);
    const layer = view.container.querySelector('[data-avatar-stickers]')!;
    expect(layer.getAttribute('data-avatar-stickers')).toBe('view');

    fireEvent.click(screen.getByRole('button', { name: 'sdk.avatar.stickers' }));
    expect(layer.getAttribute('data-avatar-stickers')).toBe('editing');
    fireEvent.click(screen.getByRole('button', { name: 'sdk.avatar.stickerAdd' }));
    expect(placements).toHaveBeenCalledTimes(1);
    const set = placements.mock.calls[0][0] as Array<{ sticker: string; x: number; y: number; s: number }>;
    expect(set).toHaveLength(1);
    expect(set[0]).toMatchObject({ sticker: 'star', x: 0.5, y: 0.5, s: 1 });
    // The token rides the query string of the same-origin asset URL.
    const img = layer.querySelector('img')!;
    expect(img.getAttribute('src')).toBe(`${STICKERS[0].src}?token=tok`);

    // A fresh add is selected, so its remove badge is up.
    fireEvent.click(screen.getByRole('button', { name: 'sdk.avatar.stickerRemove' }));
    expect(placements).toHaveBeenCalledTimes(2);
    expect(placements.mock.calls[1][0]).toEqual([]);
    expect(layer.querySelectorAll('[data-sticker-id]')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'sdk.avatar.stickersDone' }));
    expect(layer.getAttribute('data-avatar-stickers')).toBe('view');
  });

  it('feeds persisted placements back in and drops ones for unknown stickers', async () => {
    const view = renderImmersive({
      stickers: STICKERS,
      placements: [
        { id: 'a', sticker: 'star', x: 0.25, y: 0.75, s: 2, r: 30 },
        { id: 'b', sticker: 'ghost', x: 0.5, y: 0.5, s: 1, r: 0 },
      ],
    });
    await ready(view.container);
    // The layer sizes itself in an effect before it draws, one commit after the drawer.
    await waitFor(() => expect(view.container.querySelectorAll('[data-sticker-id]')).toHaveLength(1));
    const placed = view.container.querySelectorAll('[data-sticker-id]');
    expect((placed[0] as HTMLElement).style.transform).toBe('rotate(30deg) scale(2)');
    expect((placed[0] as HTMLElement).style.left).toBe('25%');
  });
});
