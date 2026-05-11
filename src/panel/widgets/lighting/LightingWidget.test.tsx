import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PanelWidget } from '../../types';
import { LightingWidget } from './LightingWidget';

vi.mock('../../../api/lighting', () => ({
  fetchAnimateSettings: vi.fn(() => Promise.resolve({ effect: 'rainbow', templates: {} })),
  fetchCurrentSync: vi.fn(() => Promise.resolve({ sync: 'static' })),
  fetchStaticColor: vi.fn(() => Promise.resolve({ r: 255, g: 0, b: 0 })),
  setMusicReactive: vi.fn(() => Promise.resolve()),
  startAnimate: vi.fn(() => Promise.resolve()),
  startScreenMirror: vi.fn(() => Promise.resolve()),
  startStatic: vi.fn(() => Promise.resolve()),
  stopLighting: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../../api/mediaLibrary', () => ({
  fetchMediaCurrent: vi.fn(() => Promise.resolve(null)),
  fetchMediaLibrary: vi.fn(() => Promise.resolve([])),
  playCurrentOrFirstMedia: vi.fn(() => Promise.resolve()),
  playMedia: vi.fn(() => Promise.resolve()),
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
      'lighting.mode.animate': 'Animate',
      'lighting.mode.gif': 'Media',
      'lighting.mode.screen': 'Screen',
      'lighting.mode.static': 'Solid',
      'lighting.panel.prev': 'Previous',
      'lighting.panel.next': 'Next',
      'lighting.panel.screenActive': 'Screen mirror active',
      'lighting.panel.selectMode': 'Select a mode',
      'lighting.controls.noMedia': 'No media available',
    }[key] ?? key),
  }),
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
  it('shows just the mode buttons in the 2x2 layout (no mode label, no thumb, no item label)', async () => {
    render(<LightingWidget widget={lightingWidget('2x2')} />);

    expect(screen.getByLabelText('Off')).toBeInTheDocument();
    expect(screen.getByLabelText('Animate')).toBeInTheDocument();
    expect(screen.getByLabelText('Solid')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });

  it('renders top-center mode label, edge-to-edge thumb, and bottom item label in the 4x2 layout', async () => {
    render(<LightingWidget widget={lightingWidget('4x2')} />);

    // Mode label in the header (Solid, since mocked sync returns 'static')
    await waitFor(() => expect(screen.getByText('Solid')).toBeInTheDocument());

    const prev = screen.getByRole('button', { name: 'Previous' });
    const next = screen.getByRole('button', { name: 'Next' });

    // Arrow buttons have no border / no background
    const prevStyle = window.getComputedStyle(prev);
    expect(prevStyle.border === '' || prevStyle.borderWidth === '0px' || prevStyle.borderStyle === 'none').toBe(true);

    expect(prev).toBeInTheDocument();
    expect(next).toBeInTheDocument();

    // Bottom-center item label - the static color label resolves to 'Red' (from #ff0000)
    await waitFor(() => expect(screen.getByText('Red')).toBeInTheDocument());
  });
});
