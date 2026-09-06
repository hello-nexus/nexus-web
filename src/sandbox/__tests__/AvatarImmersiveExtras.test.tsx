// The immersive-only extras of the `ui-avatar` composite: the immersive
// event, the bottom dock (status strip, allowlisted stream embed, open
// button) and sticker mode (palette add -> placements event, remove). The
// three.js session is mocked so no WebGL context is needed; the composite is
// rendered directly with the synced-prop shape RemoteTree hands it.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { PanelImmersiveProvider } from '../../panel/widgets/common/PanelImmersiveContext';

vi.mock('../ui/avatarSession', () => ({
  createAvatarSession: vi.fn(async () => ({
    resize: () => {},
    tick: () => {},
    handleSignal: () => {},
    triggerReaction: () => {},
    setDemo: () => {},
    startIntro: () => {},
    dispose: () => {},
  })),
}));
vi.mock('../../api/service', () => ({ postService: vi.fn(async () => ({ error: false, msg: '' })) }));
vi.mock('../../api/auth', () => ({ getToken: async () => 'tok', getTokenSync: () => 'tok' }));

import { AvatarComposite } from '../ui/AvatarComposite';
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
  // The dock mounts once the session is ready; the status strip is the cheapest tell.
  await waitFor(() => expect(container.querySelector('[data-avatar-dock]')).toBeTruthy());
}

beforeEach(() => {
  vi.mocked(postService).mockClear();
});
afterEach(() => {
  cleanup();
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

  it('docks an allowlisted stream with an open button that goes through the service, and refuses other hosts', async () => {
    const view = renderImmersive({ stream: STREAM });
    await ready(view.container);
    // jsdom has no layout: the player box waits on a measured width, but the
    // button renders regardless.
    fireEvent.click(screen.getByRole('button', { name: 'Watch' }));
    await waitFor(() => expect(postService).toHaveBeenCalledWith('/system/open-url', { url: STREAM.open }));

    const other = renderImmersive({ stream: { embed: 'https://evil.example/embed/abc123def45', open: 'https://evil.example/' } });
    await waitFor(() => expect(other.container.querySelector('canvas')).toBeTruthy());
    expect(other.container.querySelector('[data-avatar-dock]')).toBeNull();
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
    const placed = view.container.querySelectorAll('[data-sticker-id]');
    expect(placed).toHaveLength(1);
    expect((placed[0] as HTMLElement).style.transform).toBe('rotate(30deg) scale(2)');
    expect((placed[0] as HTMLElement).style.left).toBe('25%');
  });
});
