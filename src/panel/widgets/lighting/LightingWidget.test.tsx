import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelWidget } from '../../types';
import { fetchCurrentSync } from '../../../api/lighting';
import { pingService } from '../../../api/service';
import { LightingWidget } from './LightingWidget';

vi.mock('../../../api/lighting', () => ({
  effectThumbnailPath: (key: string) => `/lighting/effects/${key}/thumbnail.bmp`,
  fetchAnimateDefaults: vi.fn(() => Promise.resolve(null)),
  cachedAnimateDefaults: vi.fn(() => null),
  fetchAnimateSettings: vi.fn(() => Promise.resolve({ effect: 'rainbow', templates: {} })),
  fetchCurrentSync: vi.fn(() => Promise.resolve({ sync: 'rainbow' })),
  fetchLightingStatus: vi.fn(() => Promise.resolve({ gpuAvailable: true })),
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
  fetchMediaLibrary: vi.fn(() => Promise.resolve([])),
  playCurrentOrFirstMedia: vi.fn(() => Promise.resolve(true)),
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

  it('marks the active mode button using data-active', async () => {
    render(<LightingWidget widget={lightingWidget('4x2')} />);
    await waitFor(() => {
      const animateBtn = screen.getByRole('button', { name: 'Animation' });
      expect(animateBtn.getAttribute('data-active')).toBe('true');
    });
    expect(screen.getByRole('button', { name: 'Mirror' }).getAttribute('data-active')).toBe('false');
  });

  it('shows the Game Sync label and marks its button active when the active sync is gamesync', async () => {
    vi.mocked(fetchCurrentSync).mockResolvedValueOnce({ sync: 'gamesync' });
    render(<LightingWidget widget={lightingWidget('4x2')} />);

    await waitFor(() => expect(screen.getByText('Game Sync')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Animation' }).getAttribute('data-active')).toBe('false');
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

  it('flashes on mode change but not on initial hydration', async () => {
    render(<LightingWidget widget={lightingWidget('4x2')} />);
    // Hydration (none → animate:rainbow from fetchCurrentSync) must not flash.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Animation' }).getAttribute('data-active')).toBe('true');
    });
    expect(document.querySelector('[data-state-flash]')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mirror' }));
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
  });
});
