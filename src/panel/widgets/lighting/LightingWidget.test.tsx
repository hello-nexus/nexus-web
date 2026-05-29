import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelWidget } from '../../types';
import { LightingWidget } from './LightingWidget';

vi.mock('../../../api/lighting', () => ({
  fetchAnimateSettings: vi.fn(() => Promise.resolve({ effect: 'rainbow', templates: {} })),
  fetchCurrentSync: vi.fn(() => Promise.resolve({ sync: 'rainbow' })),
  fetchScreenEffect: vi.fn(() => Promise.resolve({ hue: 0, colorize: 0, saturation: 1, contrast: 1, flipX: false, flipY: false })),
  setMusicReactive: vi.fn(() => Promise.resolve()),
  setScreenEffect: vi.fn(() => Promise.resolve()),
  startAnimate: vi.fn(() => Promise.resolve()),
  startScreenMirror: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../../api/mediaLibrary', () => ({
  fetchMediaCurrent: vi.fn(() => Promise.resolve(null)),
  fetchMediaLibrary: vi.fn(() => Promise.resolve([])),
  playCurrentOrFirstMedia: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('../../../api/service', () => ({
  fetchServiceBlob: vi.fn(() => Promise.resolve(null)),
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
      'lighting.panel.prev': 'Previous',
      'lighting.panel.next': 'Next',
      'lighting.panel.screenActive': 'Mirror is active',
      'lighting.panel.selectMode': 'Select a mode',
      'lighting.controls.noMedia': 'No media available',
      'lighting.controls.rainbow': 'Rainbow',
      'lighting.filter.normal': 'Normal',
      'lighting.filter.bw': 'B&W',
      'lighting.filter.highsat': 'High Saturation',
      'lighting.filter.mirrorx': 'Mirror X',
      'lighting.filter.mirrory': 'Mirror Y',
    }[key] ?? key),
  }),
}));

// Default to advanced (rich) mode in these tests — the existing assertions
// describe the rich UI's surface (mode buttons + per-mode arrows). The
// new simple-mode default has its own dedicated test block below.
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

  it('renders 4x2 with three labelled mode buttons (Animation / Media / Mirror) + L/R arrows', async () => {
    render(<LightingWidget widget={lightingWidget('4x2')} />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Animation' })).toBeInTheDocument());

    expect(screen.getByRole('button', { name: 'Media' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mirror' })).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Previous' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();

    // No 'Off' or 'Static' buttons - Off isn't a widget surface and Static was
    // removed with the static mode entirely.
    expect(screen.queryByRole('button', { name: 'Off' })).not.toBeInTheDocument();
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
