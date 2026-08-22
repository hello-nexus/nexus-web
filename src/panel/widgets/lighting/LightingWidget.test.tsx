import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelWidget } from '../../types';
import { fetchCurrentSync, setScreenEffect, startAnimate, startScreenMirror, startStatic } from '../../../api/lighting';
import { fetchMediaCurrent, fetchMediaLibrary, playMedia, type MediaItem } from '../../../api/mediaLibrary';
import { pingService } from '../../../api/service';
import { STATIC_EFFECTS } from '../../../types/lighting';
import { LightingWidget } from './LightingWidget';

vi.mock('../../../api/lighting', () => ({
  effectThumbnailPath: (key: string) => `/lighting/effects/${key}/thumbnail.bmp`,
  fetchAnimateDefaults: vi.fn(() => Promise.resolve(null)),
  cachedAnimateDefaults: vi.fn(() => null),
  fetchAnimateSettings: vi.fn(() => Promise.resolve({ effect: 'rainbow', templates: {} })),
  fetchStaticSettings: vi.fn(() => Promise.resolve({ effect: 'simplewhite', states: {} })),
  startStatic: vi.fn(() => Promise.resolve()),
  fetchCurrentSync: vi.fn(() => Promise.resolve({ sync: 'rainbow' })),
  fetchLightingStatus: vi.fn(() => Promise.resolve({ gpuAvailable: true })),
  fetchLightingDevices: vi.fn(() => Promise.resolve({ isInit: true, devices: [] })),
  fetchScreenEffect: vi.fn(() => Promise.resolve({ hue: 0, colorize: 0, saturation: 1, contrast: 1, flipX: false, flipY: false })),
  setMusicReactive: vi.fn(() => Promise.resolve()),
  setScreenEffect: vi.fn(() => Promise.resolve()),
  startAnimate: vi.fn(() => Promise.resolve()),
  startGameSync: vi.fn(() => Promise.resolve()),
  startScreenMirror: vi.fn(() => Promise.resolve()),
  stopLighting: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../../api/mediaLibrary', () => ({
  fetchMediaCurrent: vi.fn(() => Promise.resolve(null)),
  fetchMediaLibrary: vi.fn(() => Promise.resolve(null)),
  mediaIdle: vi.fn(() => Promise.resolve()),
  playCurrentOrFirstMedia: vi.fn(() => Promise.resolve(true)),
  playMedia: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('../../../api/service', () => ({
  fetchServiceBlob: vi.fn(() => Promise.resolve(null)),
  pingService: vi.fn(() => Promise.resolve({ service: 'nexus', platform: 'windows' })),
}));

vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: vi.fn(),
}));

vi.mock('../../../lib/controlSync', () => ({
  publishControlSync: vi.fn(),
  subscribeControlSync: vi.fn(() => () => {}),
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'lighting.mode.off': 'Off',
      'lighting.mode.animate': 'Animation',
      'lighting.mode.gif': 'Media',
      'lighting.mode.screen': 'Mirror',
      'lighting.mode.gamesync': 'Game Sync',
      'lighting.panel.prev': 'Previous',
      'lighting.panel.next': 'Next',
      'lighting.panel.screenActive': 'Mirror is active',
      'lighting.panel.selectMode': 'Select a mode',
      'lighting.controls.noMedia': 'No media available',
      'lighting.controls.rainbow': 'Rainbow',
      'lighting.filter.passthrough': 'Pass-Through',
      'lighting.filter.reactive': 'Reactive',
    }[key] ?? key),
  }),
}));

// Default to advanced (rich) mode here - these assertions cover the
// rich UI (mode buttons + per-mode arrows). Simple mode has its own
// test block below.
const mockUiSettings = vi.hoisted(() => ({ widgetAdvancedMode: true }));
vi.mock('../../../hooks/useUiSettings', () => ({
  useUiSettings: () => ({ settings: mockUiSettings, update: vi.fn(), reload: vi.fn() }),
}));

function lightingWidget(size: PanelWidget['size']): PanelWidget {
  return {
    id: `lighting-${size}`,
    type: 'lighting',
    size,
    col: 0,
    row: 0,
  };
}

describe('LightingWidget', () => {
  it('2x2 has no arrows and no mode buttons - thumbnail only', async () => {
    render(<LightingWidget widget={lightingWidget('2x2')} />);

    // Wait one tick for hydrate() to resolve.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Animation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mirror' })).not.toBeInTheDocument();
  });

  it('2x2 in Media mode skips the media library (no name, no arrows to feed)', async () => {
    vi.mocked(fetchCurrentSync).mockResolvedValueOnce({ sync: 'gif' });
    vi.mocked(fetchMediaLibrary).mockClear();
    render(<LightingWidget widget={lightingWidget('2x2')} />);

    await waitFor(() => expect(screen.getByText('Media')).toBeInTheDocument());
    expect(fetchMediaLibrary).not.toHaveBeenCalled();
  });

  it('renders 4x2 with all five icon mode buttons (Off / Animation / Media / Mirror / Game Sync) + L/R arrows', async () => {
    render(<LightingWidget widget={lightingWidget('4x2')} />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Animation' })).toBeInTheDocument());

    expect(screen.getByRole('button', { name: 'Off' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Media' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mirror' })).toBeInTheDocument();
    // Game Sync appears once the ping resolves platform=windows.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Game Sync' })).toBeInTheDocument());

    expect(screen.getByRole('button', { name: 'Previous' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();

    // Icon-only buttons: the label lives in the aria-label, not as text.
    expect(screen.queryByText('Animation')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Static' })).not.toBeInTheDocument();
  });

  it('marks the active mode button as pressed', async () => {
    render(<LightingWidget widget={lightingWidget('4x2')} />);
    await waitFor(() => {
      const animateBtn = screen.getByRole('button', { name: 'Animation' });
      expect(animateBtn.getAttribute('data-active')).toBe('true');
    });
    expect(screen.getByRole('button', { name: 'Mirror' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows the Game Sync label and marks its button active when the active sync is gamesync', async () => {
    vi.mocked(fetchCurrentSync).mockResolvedValueOnce({ sync: 'gamesync' });
    render(<LightingWidget widget={lightingWidget('4x2')} />);

    await waitFor(() => expect(screen.getByText('Game Sync')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Animation' })).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Game Sync' }).getAttribute('data-active')).toBe('true');
    });
  });

  it('hides the Game Sync button on a non-Windows service', async () => {
    vi.mocked(pingService).mockResolvedValueOnce({ service: 'nexus', platform: 'macos' } as never);
    render(<LightingWidget widget={lightingWidget('4x2')} />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Animation' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Game Sync' })).not.toBeInTheDocument();
  });

  it('does not flash on initial hydration', async () => {
    render(<LightingWidget widget={lightingWidget('4x2')} />);
    // Hydration (none → animate:rainbow from fetchCurrentSync) must not flash.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Animation' }).getAttribute('data-active')).toBe('true');
    });
    expect(document.querySelector('[data-state-flash]')).not.toBeInTheDocument();
  });

  it('does not flash switching to a mode with no thumbnail', async () => {
    // The flash stands in for a thumbnail that has not painted; Mirror shows an
    // icon, so there is nothing to stand in for.
    render(<LightingWidget widget={lightingWidget('4x2')} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Animation' }).getAttribute('data-active')).toBe('true');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Mirror' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Mirror' }).getAttribute('data-active')).toBe('true');
    });
    expect(document.querySelector('[data-state-flash]')).not.toBeInTheDocument();
  });

  it('flashes inside the thumbnail when the effect changes', async () => {
    render(<LightingWidget widget={lightingWidget('4x2')} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Animation' }).getAttribute('data-active')).toBe('true');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(document.querySelector('[data-state-flash]')).toBeInTheDocument();
    });
  });

  describe('simple mode', () => {
    beforeEach(() => { mockUiSettings.widgetAdvancedMode = false; });
    afterEach(() => { mockUiSettings.widgetAdvancedMode = true; });

    it('renders arrows at 2x2 and drops the mode buttons', async () => {
      render(<LightingWidget widget={lightingWidget('2x2')} />);
      await waitFor(() => expect(screen.getByRole('button', { name: 'Previous' })).toBeInTheDocument());
      expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Animation' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Mirror' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Static' })).not.toBeInTheDocument();
    });

    it('renders arrows at 4x2 and drops the mode buttons', async () => {
      render(<LightingWidget widget={lightingWidget('4x2')} />);
      await waitFor(() => expect(screen.getByRole('button', { name: 'Previous' })).toBeInTheDocument());
      expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Animation' })).not.toBeInTheDocument();
    });

    // NEX-64: while in Static mode the arrows cycle the static pool in place;
    // they must not jump into the animation list.
    it('cycles the static pool from Static mode instead of entering animations', async () => {
      vi.mocked(fetchCurrentSync).mockResolvedValueOnce({ sync: 'static' });
      vi.mocked(startStatic).mockClear();
      vi.mocked(startAnimate).mockClear();
      render(<LightingWidget widget={lightingWidget('4x2')} />);
      // Static labels the card with the lit-device count, not the effect name,
      // so hydration is observable through that key (the arrows alone also
      // render pre-hydration).
      await waitFor(() => expect(screen.getByText('lighting.devices.activeCount.other')).toBeInTheDocument());

      const startIdx = STATIC_EFFECTS.findIndex(e => e.key === 'simplewhite');
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      await waitFor(() => expect(startStatic).toHaveBeenCalled());
      expect(vi.mocked(startStatic).mock.calls[0][0]).toBe(STATIC_EFFECTS[(startIdx + 1) % STATIC_EFFECTS.length].key);

      fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
      await waitFor(() => expect(startStatic).toHaveBeenCalledTimes(2));
      expect(vi.mocked(startStatic).mock.calls[1][0]).toBe('simplewhite');

      expect(startAnimate).not.toHaveBeenCalled();
    });

    const mediaItem = (id: string, name: string): MediaItem => ({
      id,
      name,
      type: 'animated',
      frames: 10,
      fps: 10,
      width: 64,
      height: 64,
      importedAtUnixMs: 0,
    });

    // NEX-64: while in Media mode the arrows cycle the media library in
    // place; they must not jump into the animation list.
    it('cycles media items from Media mode instead of entering animations', async () => {
      const items = [mediaItem('m1', 'Alpha.gif'), mediaItem('m2', 'Beta.gif'), mediaItem('m3', 'Gamma.gif')];
      vi.mocked(fetchCurrentSync).mockResolvedValueOnce({ sync: 'gif' });
      vi.mocked(fetchMediaLibrary).mockResolvedValueOnce({ items });
      vi.mocked(fetchMediaCurrent).mockResolvedValueOnce({ mediaId: 'm2', item: items[1] });
      vi.mocked(startAnimate).mockClear();
      vi.mocked(playMedia).mockClear();
      render(<LightingWidget widget={lightingWidget('4x2')} />);
      await waitFor(() => expect(screen.getByText('Beta')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      await waitFor(() => expect(playMedia).toHaveBeenCalledWith('m3'));
      await waitFor(() => expect(screen.getByText('Gamma')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
      await waitFor(() => expect(playMedia).toHaveBeenCalledWith('m2'));

      expect(startAnimate).not.toHaveBeenCalled();
    });

    // No current clip reported: the view shows the first item, so the first
    // press must advance past it, not replay it.
    it('advances from the displayed first item when no clip is active', async () => {
      const items = [mediaItem('m1', 'Alpha.gif'), mediaItem('m2', 'Beta.gif')];
      vi.mocked(fetchCurrentSync).mockResolvedValueOnce({ sync: 'gif' });
      vi.mocked(fetchMediaLibrary).mockResolvedValueOnce({ items });
      vi.mocked(fetchMediaCurrent).mockResolvedValueOnce({ mediaId: null, item: null });
      vi.mocked(playMedia).mockClear();
      render(<LightingWidget widget={lightingWidget('4x2')} />);
      await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      await waitFor(() => expect(playMedia).toHaveBeenCalledWith('m2'));
    });

    // While the library fetch is in flight the arrows are a no-op: an
    // unloaded library must not be misread as empty (which would jump the
    // panel into the animation list - the NEX-64 symptom).
    it('arrows no-op in Media mode until the library has loaded', async () => {
      vi.mocked(fetchCurrentSync).mockResolvedValueOnce({ sync: 'gif' });
      vi.mocked(fetchMediaLibrary).mockReturnValueOnce(new Promise(() => {}));
      vi.mocked(fetchMediaCurrent).mockReturnValueOnce(new Promise(() => {}));
      vi.mocked(startAnimate).mockClear();
      vi.mocked(playMedia).mockClear();
      render(<LightingWidget widget={lightingWidget('4x2')} />);
      await waitFor(() => expect(screen.getByText('Media')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(playMedia).not.toHaveBeenCalled();
      expect(startAnimate).not.toHaveBeenCalled();
    });

    // The 2x2 simple widget shows the media name + arrows, so it loads the
    // library the advanced 2x2 (no arrows, no name) skips.
    it('loads the media library at 2x2 in Media mode', async () => {
      const items = [mediaItem('m1', 'Alpha.gif')];
      vi.mocked(fetchCurrentSync).mockResolvedValueOnce({ sync: 'gif' });
      vi.mocked(fetchMediaLibrary).mockResolvedValueOnce({ items });
      vi.mocked(fetchMediaCurrent).mockResolvedValueOnce({ mediaId: 'm1', item: items[0] });
      render(<LightingWidget widget={lightingWidget('2x2')} />);
      await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());
    });

    // NEX-64: while in Mirror mode the arrows step between the two mirror
    // filters; they must not jump into the animation list.
    it('toggles the mirror filter from Mirror mode instead of entering animations', async () => {
      vi.mocked(fetchCurrentSync).mockResolvedValueOnce({ sync: 'screen' });
      vi.mocked(startAnimate).mockClear();
      vi.mocked(startScreenMirror).mockClear();
      vi.mocked(setScreenEffect).mockClear();
      render(<LightingWidget widget={lightingWidget('4x2')} />);
      await waitFor(() => expect(screen.getByText('Pass-Through')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      await waitFor(() => expect(startScreenMirror).toHaveBeenCalledTimes(1));
      expect(vi.mocked(setScreenEffect).mock.calls[0][0]).toMatchObject({ reactive: true });
      await waitFor(() => expect(screen.getByText('Reactive')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
      await waitFor(() => expect(startScreenMirror).toHaveBeenCalledTimes(2));
      expect(vi.mocked(setScreenEffect).mock.calls[1][0]).toMatchObject({ reactive: false });
      await waitFor(() => expect(screen.getByText('Pass-Through')).toBeInTheDocument());

      expect(startAnimate).not.toHaveBeenCalled();
    });
  });
});
