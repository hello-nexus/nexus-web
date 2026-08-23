import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelWidget } from '../../types';
import {
  fetchCurrentSync, startAnimate, startGameSync, startScreenMirror, startStatic, stopLighting,
} from '../../../api/lighting';
import { fetchMediaCurrent, fetchMediaLibrary, playMedia, type MediaItem } from '../../../api/mediaLibrary';
import { pingService } from '../../../api/service';
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

  it('flashes inside the thumbnail when the mode changes', async () => {
    render(<LightingWidget widget={lightingWidget('4x2')} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Animation' }).getAttribute('data-active')).toBe('true');
    });

    fireEvent.click(screen.getByRole('button', { name: /static/i }));
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
    // The arrows switch mode and nothing else: what plays inside a mode is
    // chosen on the lighting page. MODES order is off, static, animate, gif,
    // screen, gamesync (the last only on Windows, which pingService reports).
    it('steps to the next mode instead of into the effect list', async () => {
      vi.mocked(fetchCurrentSync).mockResolvedValueOnce({ sync: 'static' });
      vi.mocked(startStatic).mockClear();
      vi.mocked(startAnimate).mockClear();
      render(<LightingWidget widget={lightingWidget('4x2')} />);
      await waitFor(() => expect(screen.getByText('lighting.devices.activeCount.other')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      await waitFor(() => expect(startAnimate).toHaveBeenCalled());
      expect(startStatic).not.toHaveBeenCalled();
    });

    it('steps to the previous mode', async () => {
      vi.mocked(fetchCurrentSync).mockResolvedValueOnce({ sync: 'static' });
      vi.mocked(stopLighting).mockClear();
      vi.mocked(startStatic).mockClear();
      render(<LightingWidget widget={lightingWidget('4x2')} />);
      await waitFor(() => expect(screen.getByText('lighting.devices.activeCount.other')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
      await waitFor(() => expect(stopLighting).toHaveBeenCalled());
      expect(startStatic).not.toHaveBeenCalled();
    });

    it('wraps off the start of the mode list', async () => {
      vi.mocked(fetchCurrentSync).mockResolvedValueOnce({ sync: 'none' });
      vi.mocked(startGameSync).mockClear();
      render(<LightingWidget widget={lightingWidget('4x2')} />);
      await waitFor(() => expect(screen.getByRole('button', { name: 'Previous' })).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
      await waitFor(() => expect(startGameSync).toHaveBeenCalled());
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
    // Media is a mode like any other: the arrows leave it rather than paging
    // its library.
    it('leaves Media mode instead of paging its library', async () => {
      const items = [mediaItem('m1', 'Alpha.gif'), mediaItem('m2', 'Beta.gif')];
      vi.mocked(fetchCurrentSync).mockResolvedValueOnce({ sync: 'gif' });
      vi.mocked(fetchMediaLibrary).mockResolvedValueOnce({ items });
      vi.mocked(fetchMediaCurrent).mockResolvedValueOnce({ mediaId: 'm1', item: items[0] });
      vi.mocked(playMedia).mockClear();
      vi.mocked(startScreenMirror).mockClear();
      render(<LightingWidget widget={lightingWidget('4x2')} />);
      await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      await waitFor(() => expect(startScreenMirror).toHaveBeenCalled());
      expect(playMedia).not.toHaveBeenCalled();
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

  });
});
