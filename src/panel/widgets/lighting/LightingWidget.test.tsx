import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelWidget } from '../../types';
import {
  fetchAnimateSettings, fetchCurrentSync, saveAnimateTemplates, setMusicReactive, setScreenEffect, startAnimate,
  startScreenMirror, startStatic, stopLighting,
} from '../../../api/lighting';
import { fetchMediaCurrent, fetchMediaLibrary, playMedia, type MediaItem } from '../../../api/mediaLibrary';
import { fetchServiceBlob } from '../../../api/service';
import { CONTROL_SELECTOR } from '../../engine/usePanelTouchMode';
import { PanelOpenWidgetProvider } from '../common/PanelOpenWidgetContext';
import { slotThumbSignature } from '../../../types/lightingTemplates';
import { defaultStateFor, type EffectState } from '../../../types/lighting';
import { paletteColor } from '../../../types/lightingPalette';
import { LightingWidget } from './LightingWidget';

vi.mock('../../../api/lighting', () => ({
  effectThumbnailPath: (key: string, slot: number, v: string) => `/lighting/effects/${key}/thumbnail.bmp?slot=${slot}&v=${v}`,
  saveAnimateTemplates: vi.fn(() => Promise.resolve({})),
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
  startScreenMirror: vi.fn(() => Promise.resolve()),
  stopLighting: vi.fn(() => Promise.resolve()),
}));

const mockCustoms = vi.hoisted(() => [] as { id: string; name: string; updatedAt: number }[]);
vi.mock('../../../api/customEffects', async importActual => ({
  ...(await importActual<typeof import('../../../api/customEffects')>()),
  useCustomEffects: () => mockCustoms,
}));

vi.mock('../../../api/mediaLibrary', () => ({
  fetchMediaCurrent: vi.fn(() => Promise.resolve(null)),
  fetchMediaLibrary: vi.fn(() => Promise.resolve(null)),
  mediaIdle: vi.fn(() => Promise.resolve()),
  playCurrentOrFirstMedia: vi.fn(() => Promise.resolve(true)),
  playMedia: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('./LightingLivePreview', () => ({
  LightingLivePreview: () => <div data-testid="live-preview" />,
}));

vi.mock('./LightingShaderPreview', () => ({
  LightingShaderPreview: () => <div data-testid="shader-preview" />,
}));

vi.mock('../../../api/service', () => ({
  fetchServiceBlob: vi.fn(() => Promise.resolve(null)),
}));

// Captured so a test can fire the lighting broadcast the service sends after
// every mode change - the re-hydrate it drives is where stale state creeps in.
const lightingTopicCallbacks = vi.hoisted(() => [] as (() => void)[]);
vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: vi.fn((topic: string, enabled: boolean, cb: () => void) => {
    if (topic === 'lighting' && enabled && !lightingTopicCallbacks.includes(cb)) {
      lightingTopicCallbacks.push(cb);
    }
  }),
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
const mockUiSettings = vi.hoisted(() => ({ widgetAdvancedMode: true, recentStaticColors: [] as string[], recentAnimations: [] as string[] }));
const mockUpdate = vi.hoisted(() => vi.fn());
const mockFlags = vi.hoisted(() => ({ lighting: true, cooling: true, monitoring: true, diagnostics: true }));
vi.mock('../../../hooks/useUiSettings', () => ({
  useUiSettings: () => ({ settings: mockUiSettings, update: mockUpdate, reload: vi.fn() }),
  useFeatureFlags: () => mockFlags,
}));

function lightingWidget(size: PanelWidget['size'], config?: Record<string, unknown>): PanelWidget {
  return {
    id: `lighting-${size}`,
    type: 'lighting',
    size,
    col: 0,
    row: 0,
    ...(config ? { config } : {}),
  };
}

const waitForMode = (mode: string) => waitFor(() => expect(document.querySelector(`[data-mode="${mode}"]`)).toBeInTheDocument());

// A surface where a cell tap acts, so the open tile shows.
const renderLighting = (widget: PanelWidget) => render(
  <PanelOpenWidgetProvider value={() => () => {}}><LightingWidget widget={widget} /></PanelOpenWidgetProvider>,
);

describe('LightingWidget', () => {
  it('2x2 has no arrows and no mode buttons - thumbnail only', async () => {
    renderLighting(lightingWidget('2x2'));

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
    renderLighting(lightingWidget('2x2'));

    await waitFor(() => expect(screen.getByText('Media')).toBeInTheDocument());
    expect(fetchMediaLibrary).not.toHaveBeenCalled();
  });

  it('renders 4x2 with all four icon mode buttons (Off / Animation / Media / Mirror) and no arrows', async () => {
    renderLighting(lightingWidget('4x2'));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Animation' })).toBeInTheDocument());

    expect(screen.getByRole('button', { name: 'Off' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Media' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mirror' })).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();

    // Icon-only buttons: the label lives in the aria-label, not as text.
    expect(screen.queryByText('Animation')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Static' })).not.toBeInTheDocument();
  });

  it('leaves the small animate preview swipeable, and blocks the swipe only in fullscreen', async () => {
    // The overlay's swipe-to-dismiss is opted out of with
    // data-panel-no-sheet-swipe. On the small preview that made the immersive
    // view impossible to close by dragging from the canvas, which is most of
    // its area; only the fullscreen shader should block it.
    render(<LightingWidget widget={lightingWidget('4x4')} immersive />);
    const open = await screen.findByRole('button', { name: 'lighting.fullscreen' });
    expect(open).not.toHaveAttribute('data-panel-no-sheet-swipe');

    fireEvent.click(open);
    const exit = await screen.findByRole('button', { name: 'lighting.fullscreen.exit' });
    expect(exit).toHaveAttribute('data-panel-no-sheet-swipe', 'true');
  });

  it('marks the active mode button as pressed', async () => {
    renderLighting(lightingWidget('4x2'));
    await waitFor(() => {
      const animateBtn = screen.getByRole('button', { name: 'Animation' });
      expect(animateBtn.getAttribute('data-active')).toBe('true');
    });
    expect(screen.getByRole('button', { name: 'Mirror' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('does not flash on initial hydration', async () => {
    renderLighting(lightingWidget('4x2'));
    // Hydration (none → animate:rainbow from fetchCurrentSync) must not flash.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Animation' }).getAttribute('data-active')).toBe('true');
    });
    expect(document.querySelector('[data-state-flash]')).not.toBeInTheDocument();
  });

  it('does not flash switching to a mode with no thumbnail', async () => {
    // The flash stands in for a thumbnail that has not painted; Mirror shows an
    // icon, so there is nothing to stand in for.
    renderLighting(lightingWidget('4x2'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Animation' }).getAttribute('data-active')).toBe('true');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Mirror' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Mirror' }).getAttribute('data-active')).toBe('true');
    });
    expect(document.querySelector('[data-state-flash]')).not.toBeInTheDocument();
  });

  it.each([
    ['none', 'lucide-lightbulb', 'Off'],
    ['gif', 'lucide-film', 'Media'],
    ['screen', 'lucide-monitor-play', 'Pass-Through'],
  ])('shows %s as the %s icon and its caption', async (sync, iconClass, caption) => {
    vi.mocked(fetchCurrentSync).mockResolvedValueOnce({ sync });
    renderLighting(lightingWidget('4x2'));

    await waitFor(() => expect(screen.getByText(caption)).toBeInTheDocument());
    expect(document.querySelector(`[class*="thumbIconWrap"] .${iconClass}`)).toBeInTheDocument();
  });

  const tileCount = () => document.querySelectorAll('[data-swatch-hex], [data-effect-key], [data-swatch-open]').length;
  const gridDims = () => {
    const g = document.querySelector('[class*="swatchGrid"]') as HTMLElement;
    return `${g.dataset.cols}x${g.dataset.rows}`;
  };

  it('shows Static as unlabeled color swatches with no device count', async () => {
    vi.mocked(fetchCurrentSync).mockResolvedValueOnce({ sync: 'static' });
    vi.mocked(fetchServiceBlob).mockClear();
    renderLighting(lightingWidget('4x2'));

    await waitFor(() => expect(document.querySelectorAll('[data-swatch-hex]')).toHaveLength(5));
    expect(screen.queryByText(/activeCount/)).not.toBeInTheDocument();
    expect(document.querySelector('[class*="thumbIconWrap"]')).not.toBeInTheDocument();
    for (const el of document.querySelectorAll('[data-swatch-hex]')) expect(el.textContent).toBe('');
    const paths = vi.mocked(fetchServiceBlob).mock.calls.map(c => String(c[0]));
    expect(paths.some(p => p.includes('simplewhite'))).toBe(false);
  });

  // [size, columns x rows, tiles including the open tile]
  const GRID_CASES = [['2x2', '2x2', 4], ['4x2', '3x2', 6], ['4x4', '3x5', 15]] as const;

  describe.each([['with mode buttons', true], ['without mode buttons', false]] as const)('grid %s', (_name, advanced) => {
    beforeEach(() => { mockUiSettings.widgetAdvancedMode = advanced; });
    afterEach(() => { mockUiSettings.widgetAdvancedMode = true; });

    it.each(GRID_CASES)('%s Static is %s with %i tiles ending in the open tile', async (size, dims, total) => {
      vi.mocked(fetchCurrentSync).mockResolvedValueOnce({ sync: 'static' });
      renderLighting(lightingWidget(size));
      await waitFor(() => expect(document.querySelectorAll('[data-swatch-hex]')).toHaveLength(total - 1));
      expect(gridDims()).toBe(dims);
      expect(tileCount()).toBe(total);
      const grid = document.querySelector('[class*="swatchGrid"]') as HTMLElement;
      expect(grid.lastElementChild?.querySelector('[data-swatch-open]')).not.toBeNull();
    });

    it.each(GRID_CASES)('%s Animation is %s with %i tiles ending in the open tile', async (size, dims, total) => {
      renderLighting(lightingWidget(size));
      await waitFor(() => expect(document.querySelectorAll('[data-effect-key]')).toHaveLength(total - 1));
      expect(gridDims()).toBe(dims);
      expect(tileCount()).toBe(total);
      expect(document.querySelector('[class*="labelOverlay"]')).not.toBeInTheDocument();
      const grid = document.querySelector('[class*="swatchGrid"]') as HTMLElement;
      expect(grid.lastElementChild?.querySelector('[data-swatch-open]')).not.toBeNull();
    });
  });

  it.each(GRID_CASES)('%s fills its box with 1fr tracks and no measured pixel size', async (size, dims) => {
    renderLighting(lightingWidget(size));
    await waitFor(() => expect(document.querySelectorAll('[data-effect-key]').length).toBeGreaterThan(0));
    const grid = document.querySelector('[class*="swatchGrid"]') as HTMLElement;
    const [cols, rows] = dims.split('x');
    expect(grid.style.gridTemplateColumns).toBe(`repeat(${cols}, minmax(0, 1fr))`);
    expect(grid.style.gridTemplateRows).toBe(`repeat(${rows}, minmax(0, 1fr))`);
    expect(grid.style.width).toBe('');
  });

  it('opens Lighting through the panel cell-tap handler from the open tile', async () => {
    const onOpen = vi.fn();
    const widget = lightingWidget('4x2');
    render(<PanelOpenWidgetProvider value={() => onOpen}><LightingWidget widget={widget} /></PanelOpenWidgetProvider>);
    const open = await waitFor(() => {
      const el = document.querySelector('[data-swatch-open]') as HTMLElement;
      expect(el).not.toBeNull();
      return el;
    });
    expect(open.matches(CONTROL_SELECTOR)).toBe(true);
    expect(open).toHaveAttribute('aria-label', 'lighting.widget.openLighting');
    expect(open.querySelector('.lucide-ellipsis')).not.toBeNull();
    expect(open).not.toHaveAttribute('title');
    fireEvent.click(open);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(startAnimate).not.toHaveBeenCalled();
  });

  it('shows an ellipsis on a colorless open tile in every mode', async () => {
    vi.mocked(fetchCurrentSync).mockResolvedValueOnce({ sync: 'static' });
    renderLighting(lightingWidget('4x2'));
    const open = await waitFor(() => {
      const el = document.querySelector('[data-swatch-open]') as HTMLElement;
      expect(el).not.toBeNull();
      return el;
    });
    expect(open.querySelector('.lucide-ellipsis')).not.toBeNull();
    expect(open.querySelector('.lucide-palette')).toBeNull();
  });

  it('falls back to the dashboard section link when the cell tap does nothing', async () => {
    const onSectionNavigate = vi.fn();
    render(
      <PanelOpenWidgetProvider value={() => null}>
        <LightingWidget widget={lightingWidget('4x2')} onSectionNavigate={onSectionNavigate} />
      </PanelOpenWidgetProvider>,
    );
    const open = await waitFor(() => {
      const el = document.querySelector('[data-swatch-open]') as HTMLElement;
      expect(el).not.toBeNull();
      return el;
    });
    fireEvent.click(open);
    expect(onSectionNavigate).toHaveBeenCalledWith('lighting');
  });

  it('hides the open tile where nothing would open, and the last slot becomes a swatch', async () => {
    render(<LightingWidget widget={lightingWidget('4x2')} />);
    await waitFor(() => expect(document.querySelectorAll('[data-effect-key]')).toHaveLength(6));
    expect(document.querySelector('[data-swatch-open]')).toBeNull();
  });

  it('applies a tapped color immediately as the global flat color without recording it', async () => {
    vi.mocked(fetchCurrentSync).mockResolvedValueOnce({ sync: 'static' });
    vi.mocked(startStatic).mockClear();
    mockUpdate.mockClear();
    renderLighting(lightingWidget('4x2'));
    await waitFor(() => expect(document.querySelectorAll('[data-swatch-hex]')).toHaveLength(5));

    const hex = paletteColor('red-3')!.hex;
    const swatch = document.querySelector(`[data-swatch-hex="${hex}"]`) as HTMLElement;
    fireEvent.click(swatch);
    await waitFor(() => expect(startStatic).toHaveBeenCalled());
    const args = vi.mocked(startStatic).mock.calls[0];
    expect(args[0]).toBe('gradientlinear');
    expect(args[8]).toBe(hex);
    expect(mockUpdate).not.toHaveBeenCalled();
    await waitFor(() => expect(swatch).toHaveAttribute('aria-pressed', 'true'));
  });

  it('leads with Rainbow and applies it with its preset look', async () => {
    vi.mocked(startAnimate).mockClear();
    mockUpdate.mockClear();
    renderLighting(lightingWidget('2x2'));
    await waitFor(() => expect(document.querySelectorAll('[data-effect-key]')).toHaveLength(3));

    const first = document.querySelectorAll('[data-effect-key]')[0] as HTMLElement;
    expect(first.getAttribute('data-effect-key')).toBe('rainbow');
    fireEvent.click(first);
    await waitFor(() => expect(startAnimate).toHaveBeenCalled());
    expect(vi.mocked(startAnimate).mock.calls[0][0]).toBe('rainbow');
    expect(vi.mocked(startAnimate).mock.calls[0][1]).toBe(50);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  describe('recently used', () => {
    afterEach(() => {
      mockUiSettings.recentStaticColors = [];
      mockUiSettings.recentAnimations = [];
    });

    it('shows recents when the widget has no saved choice', async () => {
      mockUiSettings.recentAnimations = ['aurora'];
      renderLighting(lightingWidget('4x2'));
      await waitFor(() => expect(document.querySelectorAll('[data-effect-key]')).toHaveLength(5));
      expect(document.querySelectorAll('[data-effect-key]')[0].getAttribute('data-effect-key')).toBe('aurora');
    });

    const heldOrder = () => [...document.querySelectorAll('[data-swatch-hex]')].map(e => e.getAttribute('data-swatch-hex'));

    it('shows a pick made elsewhere at once', async () => {
      vi.mocked(fetchCurrentSync).mockResolvedValueOnce({ sync: 'static' });
      const view = renderLighting(lightingWidget('4x2'));
      await waitFor(() => expect(document.querySelectorAll('[data-swatch-hex]')).toHaveLength(5));
      mockUiSettings.recentStaticColors = ['#123456'];
      view.rerender(
        <PanelOpenWidgetProvider value={() => () => {}}><LightingWidget widget={lightingWidget('4x2')} /></PanelOpenWidgetProvider>,
      );
      expect(heldOrder()[0]).toBe('#123456');
    });

    it('keeps the grid order and recents unchanged after a tap here', async () => {
      vi.mocked(fetchCurrentSync).mockResolvedValueOnce({ sync: 'static' });
      mockUpdate.mockClear();
      mockUpdate.mockImplementation((patch: Record<string, unknown>) => { Object.assign(mockUiSettings, patch); });
      try {
        const view = renderLighting(lightingWidget('4x2'));
        await waitFor(() => expect(document.querySelectorAll('[data-swatch-hex]')).toHaveLength(5));
        const before = heldOrder();
        fireEvent.click(document.querySelector(`[data-swatch-hex="${before[3]}"]`) as HTMLElement);
        await waitFor(() => expect(startStatic).toHaveBeenCalled());
        view.rerender(
          <PanelOpenWidgetProvider value={() => () => {}}><LightingWidget widget={lightingWidget('4x2')} /></PanelOpenWidgetProvider>,
        );
        expect(heldOrder()).toEqual(before);
        expect(mockUpdate).not.toHaveBeenCalled();
      } finally {
        mockUpdate.mockReset();
      }
    });

    it('Off ignores history and shows the fixed order', async () => {
      mockUiSettings.recentAnimations = ['aurora'];
      renderLighting(lightingWidget('4x2', { showRecents: false }));
      await waitFor(() => expect(document.querySelectorAll('[data-effect-key]')).toHaveLength(5));
      expect(document.querySelectorAll('[data-effect-key]')[0].getAttribute('data-effect-key')).toBe('rainbow');
    });

    it('On shows recent animations first, then the fixed order without repeats', async () => {
      mockUiSettings.recentAnimations = ['aurora', 'rainbow'];
      renderLighting(lightingWidget('4x2', { showRecents: true }));
      await waitFor(() => expect(document.querySelectorAll('[data-effect-key]')).toHaveLength(5));
      const keys = [...document.querySelectorAll('[data-effect-key]')].map(e => e.getAttribute('data-effect-key'));
      expect(keys).toEqual(['aurora', 'rainbow', 'plasma', 'fire', 'sweepliquid']);
    });

    it('On shows recent colors first, then the fixed palette without repeats', async () => {
      const first = paletteColor('white-1')!.hex;
      mockUiSettings.recentStaticColors = ['#123456', first];
      vi.mocked(fetchCurrentSync).mockResolvedValueOnce({ sync: 'static' });
      renderLighting(lightingWidget('4x2', { showRecents: true }));
      await waitFor(() => expect(document.querySelectorAll('[data-swatch-hex]')).toHaveLength(5));
      const hexes = [...document.querySelectorAll('[data-swatch-hex]')].map(e => e.getAttribute('data-swatch-hex'));
      expect(hexes.slice(0, 2)).toEqual(['#123456', first]);
      expect(new Set(hexes.map(h => h!.toLowerCase())).size).toBe(5);
    });

    it('On with no history is the fixed list', async () => {
      renderLighting(lightingWidget('4x2', { showRecents: true }));
      await waitFor(() => expect(document.querySelectorAll('[data-effect-key]')).toHaveLength(5));
      expect(document.querySelectorAll('[data-effect-key]')[0].getAttribute('data-effect-key')).toBe('rainbow');
    });
  });

  // The panel opens the app page (desktop) or immersive view (touch) on a tap
  // that lands outside every control (usePanelTouchMode), so swatches own their
  // taps while the grid's gaps and margins stay open-the-page surface.
  describe.each([['advanced', true], ['simple', false]] as const)('page entry in %s layout', (_name, advanced) => {
    beforeEach(() => { mockUiSettings.widgetAdvancedMode = advanced; });
    afterEach(() => { mockUiSettings.widgetAdvancedMode = true; });

    it.each(['2x2', '4x2', '4x4'] as const)('keeps a non-control tap surface around the %s swatches', async size => {
      renderLighting(lightingWidget(size));
      await waitFor(() => expect(document.querySelectorAll('[data-effect-key]').length).toBeGreaterThan(0));
      for (const card of document.querySelectorAll('[data-effect-key]')) {
        expect(card.matches(CONTROL_SELECTOR)).toBe(true);
      }
      const grid = document.querySelector('[class*="swatchGrid"]') as HTMLElement;
      expect(grid.matches(CONTROL_SELECTOR)).toBe(false);
      expect((grid.parentElement as HTMLElement).matches(CONTROL_SELECTOR)).toBe(false);
      expect(grid.closest(CONTROL_SELECTOR)).toBeNull();
    });
  });

  it('applies a tapped animation immediately', async () => {
    vi.mocked(startAnimate).mockClear();
    renderLighting(lightingWidget('4x2'));
    await waitFor(() => expect(document.querySelectorAll('[data-effect-key]')).toHaveLength(5));

    const target = document.querySelectorAll('[data-effect-key]')[2] as HTMLElement;
    fireEvent.click(target);
    await waitFor(() => expect(startAnimate).toHaveBeenCalled());
    expect(vi.mocked(startAnimate).mock.calls[0][0]).toBe(target.getAttribute('data-effect-key'));
  });

  // A simple-mode animation is a catalogue effect: the tile has to picture it,
  // not fall back to the last pick.
  it('pictures a running simple-mode animation in the immersive view', async () => {
    vi.mocked(fetchCurrentSync).mockResolvedValueOnce({ sync: 'sweepcycle' });
    vi.mocked(fetchServiceBlob).mockClear();
    render(<LightingWidget widget={lightingWidget('4x2')} immersive />);

    await waitFor(() => {
      const paths = vi.mocked(fetchServiceBlob).mock.calls.map(c => String(c[0]));
      expect(paths.some(p => p.includes('sweepcycle'))).toBe(true);
    });
  });

  // Static assigns per device, so no single preview can state what it is doing:
  // it used to render one static effect's shader full-bleed, picturing a
  // selection that does not exist. The device cards' own strips carry it now.
  it('immersive Static shows no preview at all', async () => {
    vi.mocked(fetchCurrentSync).mockResolvedValueOnce({ sync: 'static' });
    render(<LightingWidget widget={lightingWidget('4x2')} immersive />);

    await waitFor(() => expect(screen.getByText('lighting.mode.static')).toBeInTheDocument());
    expect(screen.queryByTestId('shader-preview')).not.toBeInTheDocument();
    expect(screen.queryByTestId('live-preview')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'lighting.fullscreen' })).not.toBeInTheDocument();
  });

  it('immersive Animation still renders its shader', async () => {
    render(<LightingWidget widget={lightingWidget('4x2')} immersive />);

    await waitFor(() => expect(screen.getByTestId('shader-preview')).toBeInTheDocument());
    expect(screen.queryByTestId('live-preview')).not.toBeInTheDocument();
  });

  describe('simple mode', () => {
    beforeEach(() => { mockUiSettings.widgetAdvancedMode = false; });
    afterEach(() => { mockUiSettings.widgetAdvancedMode = true; });

    it('renders arrows at 2x2 and drops the mode buttons', async () => {
      renderLighting(lightingWidget('2x2'));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Previous' })).toBeInTheDocument());
      expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Animation' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Mirror' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Static' })).not.toBeInTheDocument();
    });

    it('renders arrows at 4x2 and drops the mode buttons', async () => {
      renderLighting(lightingWidget('4x2'));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Previous' })).toBeInTheDocument());
      expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Animation' })).not.toBeInTheDocument();
    });

    // NEX-64: while in Static mode the arrows cycle the static pool in place;
    // they must not jump into the animation list.
    // The arrows switch mode and nothing else: what plays inside a mode is
    // chosen on the lighting page. MODES order is off, static, animate, gif,
    // screen.
    it('steps to the next mode instead of into the effect list', async () => {
      vi.mocked(fetchCurrentSync).mockResolvedValueOnce({ sync: 'static' });
      vi.mocked(startStatic).mockClear();
      vi.mocked(startAnimate).mockClear();
      renderLighting(lightingWidget('4x2'));
      await waitForMode('static');

      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      await waitFor(() => expect(startAnimate).toHaveBeenCalled());
      expect(startStatic).not.toHaveBeenCalled();
    });

    it('steps to the previous mode', async () => {
      vi.mocked(fetchCurrentSync).mockResolvedValueOnce({ sync: 'static' });
      vi.mocked(stopLighting).mockClear();
      vi.mocked(startStatic).mockClear();
      renderLighting(lightingWidget('4x2'));
      await waitForMode('static');

      fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
      await waitFor(() => expect(stopLighting).toHaveBeenCalled());
      expect(startStatic).not.toHaveBeenCalled();
    });

    // The arrows change the mode and nothing else - stepping out of a mode and
    // back must replay what was selected, not a catalog default.
    it('restores the previous animation after stepping through Static', async () => {
      vi.mocked(fetchCurrentSync).mockResolvedValueOnce({ sync: 'nebula' });
      vi.mocked(fetchAnimateSettings).mockResolvedValueOnce({ effect: 'nebula', templates: {} });
      vi.mocked(startAnimate).mockClear();
      vi.mocked(startStatic).mockClear();
      renderLighting(lightingWidget('4x2'));
      await waitForMode('animate');

      // MODES order: off, static, animate, gif, screen.
      fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
      await waitFor(() => expect(startStatic).toHaveBeenCalled());

      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      await waitFor(() => expect(startAnimate).toHaveBeenCalled());
      expect(vi.mocked(startAnimate).mock.calls[0][0]).toBe('nebula');
    });

    it('keeps the animation when the mode step broadcasts a re-hydrate', async () => {
      lightingTopicCallbacks.length = 0;
      vi.mocked(fetchCurrentSync).mockResolvedValueOnce({ sync: 'nebula' });
      vi.mocked(fetchAnimateSettings).mockResolvedValueOnce({ effect: 'nebula', templates: {} });
      vi.mocked(startAnimate).mockClear();
      vi.mocked(startStatic).mockClear();
      renderLighting(lightingWidget('4x2'));
      await waitForMode('animate');

      fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
      await waitFor(() => expect(startStatic).toHaveBeenCalled());

      // What the service reports once Static is running: sync flips, the
      // animate pick stays behind it.
      vi.mocked(fetchCurrentSync).mockResolvedValueOnce({ sync: 'static' });
      vi.mocked(fetchAnimateSettings).mockResolvedValueOnce({ effect: 'nebula', templates: {} });
      await act(async () => { for (const cb of lightingTopicCallbacks) cb(); });

      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      await waitFor(() => expect(startAnimate).toHaveBeenCalled());
      expect(vi.mocked(startAnimate).mock.calls[0][0]).toBe('nebula');
    });

    it('restores the previous static effect after stepping through Off', async () => {
      vi.mocked(fetchCurrentSync).mockResolvedValueOnce({ sync: 'static' });
      vi.mocked(startStatic).mockClear();
      renderLighting(lightingWidget('4x2'));
      await waitForMode('static');

      fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
      await waitFor(() => expect(stopLighting).toHaveBeenCalled());

      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      await waitFor(() => expect(startStatic).toHaveBeenCalled());
      expect(vi.mocked(startStatic).mock.calls[0][0]).toBe('simplewhite');
    });

    // Entering Mirror must not author its post-process, and no mode step may
    // clear the music-reactive preference.
    it('enters Mirror without writing its look or the music-reactive flag', async () => {
      vi.mocked(fetchCurrentSync).mockResolvedValueOnce({ sync: 'gif' });
      vi.mocked(setScreenEffect).mockClear();
      vi.mocked(setMusicReactive).mockClear();
      vi.mocked(startScreenMirror).mockClear();
      renderLighting(lightingWidget('4x2'));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      await waitFor(() => expect(startScreenMirror).toHaveBeenCalled());
      // Not a screen choice: no monitor, so the service keeps the persisted one.
      expect(vi.mocked(startScreenMirror).mock.calls[0][2]).toBeUndefined();
      expect(setScreenEffect).not.toHaveBeenCalled();
      expect(setMusicReactive).not.toHaveBeenCalled();
    });

    it('wraps off the start of the mode list', async () => {
      vi.mocked(fetchCurrentSync).mockResolvedValueOnce({ sync: 'none' });
      vi.mocked(startScreenMirror).mockClear();
      renderLighting(lightingWidget('4x2'));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Previous' })).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
      await waitFor(() => expect(startScreenMirror).toHaveBeenCalled());
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
      renderLighting(lightingWidget('4x2'));
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
      renderLighting(lightingWidget('2x2'));
      await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());
    });

  });

  describe('lighting feature disabled', () => {
    beforeEach(() => { mockFlags.lighting = false; });
    afterEach(() => { mockFlags.lighting = true; });

    it('renders the disabled shell and fetches nothing', async () => {
      vi.mocked(fetchCurrentSync).mockClear();
      renderLighting(lightingWidget('4x2'));

      expect(screen.getByText('featureDisabled.widget.lighting')).toBeInTheDocument();
      await new Promise(r => setTimeout(r, 0));
      expect(fetchCurrentSync).not.toHaveBeenCalled();
    });

    it('calls onSectionNavigate with lighting when the action button is clicked', () => {
      const onSectionNavigate = vi.fn();
      render(<LightingWidget widget={lightingWidget('4x2')} onSectionNavigate={onSectionNavigate} />);

      fireEvent.click(screen.getByText('featureDisabled.widget.open'));
      expect(onSectionNavigate).toHaveBeenCalledWith('lighting');
    });
  });

  describe('recents keep the preset they were picked at', () => {
    const slotState = (n: number): EffectState => ({ ...defaultStateFor('fire'), speed: 10 * (n + 1), hue: n / 10, params: { amount: n / 4 } });
    const bundle = (selected: number) => ({ selected, slots: [0, 1, 2, 3].map(slotState) });
    const thumbVersion = (key: string) => {
      const path = vi.mocked(fetchServiceBlob).mock.calls.map(c => String(c[0])).find(p => p.includes(`/${key}/`));
      return { slot: Number(/slot=(\d+)/.exec(path ?? '')?.[1]), v: /v=([^&]+)/.exec(path ?? '')?.[1] };
    };
    // The look a start call put on the LEDs, in the shape the thumbnail signature hashes.
    const appliedLook = (): EffectState => {
      const a = vi.mocked(startAnimate).mock.calls.at(-1)!;
      return { speed: a[1] as number, intensity: a[2] as number, hue: a[3] as number, colorize: a[4] as number, saturation: a[5] as number, contrast: a[6] as number, params: a[7] as Record<string, number> };
    };

    afterEach(() => {
      mockUiSettings.recentAnimations = [];
      mockCustoms.length = 0;
    });

    it('a built-in picked at preset 3 shows preset 3 and applies exactly it', async () => {
      mockUiSettings.recentAnimations = ['fire@2'];
      vi.mocked(fetchAnimateSettings).mockResolvedValue({ effect: 'rainbow', templates: { fire: bundle(0) } } as never);
      vi.mocked(fetchServiceBlob).mockClear();
      vi.mocked(startAnimate).mockClear();
      renderLighting(lightingWidget('4x2'));
      await waitFor(() => expect(document.querySelector('[data-effect-key="fire"]')).toBeInTheDocument());
      await waitFor(() => expect(thumbVersion('fire').v).toBeDefined());

      fireEvent.click(document.querySelector('[data-effect-key="fire"]') as HTMLElement);
      await waitFor(() => expect(startAnimate).toHaveBeenCalled());

      const thumb = thumbVersion('fire');
      expect(thumb.slot).toBe(2);
      expect(thumb.v).toBe(slotThumbSignature(slotState(2)));
      expect(appliedLook()).toEqual(slotState(2));
      expect(slotThumbSignature(appliedLook())).toBe(thumb.v);
      await waitFor(() => expect(saveAnimateTemplates).toHaveBeenCalled());
      expect(vi.mocked(saveAnimateTemplates).mock.calls.at(-1)![0].fire.selected).toBe(2);
    });

    it('a Studio effect shows its own preset and applies exactly it', async () => {
      mockUiSettings.recentAnimations = ['custom:abc@3'];
      mockCustoms.push({ id: 'abc', name: 'Sunset', updatedAt: 7 });
      vi.mocked(fetchAnimateSettings).mockResolvedValue({ effect: 'rainbow', templates: { 'custom:abc': bundle(0) } } as never);
      vi.mocked(fetchServiceBlob).mockClear();
      vi.mocked(startAnimate).mockClear();
      renderLighting(lightingWidget('4x2'));
      await waitFor(() => expect(document.querySelector('[data-effect-key="custom:abc"]')).toBeInTheDocument());
      await waitFor(() => expect(thumbVersion('custom:abc').v).toBeDefined());

      fireEvent.click(document.querySelector('[data-effect-key="custom:abc"]') as HTMLElement);
      await waitFor(() => expect(startAnimate).toHaveBeenCalled());

      const thumb = thumbVersion('custom:abc');
      expect(thumb.slot).toBe(3);
      expect(thumb.v).toBe(`7.${slotThumbSignature(slotState(3))}`);
      expect(vi.mocked(startAnimate).mock.calls.at(-1)![0]).toBe('custom:abc');
      expect(appliedLook()).toEqual(slotState(3));
      expect(screen.getByRole('button', { name: 'Sunset' })).toBe(document.querySelector('[data-effect-key="custom:abc"]'));
    });

    it('one effect at two presets is two tiles, and an old bare key follows the current preset', async () => {
      mockUiSettings.recentAnimations = ['fire@2', 'fire@0', 'fire'];
      vi.mocked(fetchAnimateSettings).mockResolvedValue({ effect: 'rainbow', templates: { fire: bundle(0) } } as never);
      renderLighting(lightingWidget('4x2'));
      await waitFor(() => expect(document.querySelectorAll('[data-effect-key="fire"]')).toHaveLength(2));
    });

    it('a recent for a deleted Studio effect shows no tile', async () => {
      mockUiSettings.recentAnimations = ['custom:gone@1', 'fire@1'];
      renderLighting(lightingWidget('4x2'));
      await waitFor(() => expect(document.querySelector('[data-effect-key="fire"]')).toBeInTheDocument());
      expect(document.querySelector('[data-effect-key="custom:gone"]')).not.toBeInTheDocument();
    });
  });
});
