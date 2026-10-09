import { act, render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StreamDeckSummary } from '../../api/streamdeck';

// Real useTranslation returns the bare key (no interpolation) when there is no
// I18nProvider ancestor; the model-option labels need the interpolated params
// to tell otherwise-identical option text apart.
vi.mock('../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));

const mockUseStreamDecks = vi.fn();
vi.mock('../../hooks/useStreamDecks', () => ({
  useStreamDecks: () => mockUseStreamDecks(),
}));

const mockGetDevModels = vi.fn();
const mockSimulate = vi.fn();
const mockClearSimulated = vi.fn();
const mockSimInput = vi.fn();
vi.mock('../../api/streamdeck', async () => {
  const actual = await vi.importActual<typeof import('../../api/streamdeck')>('../../api/streamdeck');
  return {
    ...actual,
    getStreamDeckDevModels: (...a: unknown[]) => mockGetDevModels(...a),
    simulateStreamDeck: (...a: unknown[]) => mockSimulate(...a),
    clearSimulatedStreamDeck: (...a: unknown[]) => mockClearSimulated(...a),
    simulateStreamDeckInput: (...a: unknown[]) => mockSimInput(...a),
  };
});

import { StreamDeckSimRow } from './ToolsView';

function makeDeck(over: Partial<StreamDeckSummary> = {}): StreamDeckSummary {
  return {
    serial: 'sim-0080', model: 'MK.2', name: 'MK.2', connected: true, verified: false,
    rows: 3, cols: 5, keyCount: 15, keyPixels: 72, format: 'jpeg', brightness: 60,
    ...over,
  };
}

const mockRefresh = vi.fn();

function decksReturn(decks: StreamDeckSummary[]) {
  return { decks, loaded: true, rename: vi.fn(), setBrightness: vi.fn(), setOrientation: vi.fn(), setSleepAfterSeconds: vi.fn(), refresh: mockRefresh };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDevModels.mockResolvedValue([
    { productId: 99, name: 'Mini', rows: 2, cols: 3, keyCount: 6 },
    { productId: 128, name: 'MK.2', rows: 3, cols: 5, keyCount: 15 },
    { productId: 108, name: 'XL', rows: 4, cols: 8, keyCount: 32 },
  ]);
  mockSimulate.mockResolvedValue(true);
  mockClearSimulated.mockResolvedValue(true);
  mockSimInput.mockResolvedValue(true);
  mockUseStreamDecks.mockReturnValue(decksReturn([]));
});

async function renderCard() {
  await act(async () => { render(<StreamDeckSimRow />); });
  // Let the model-fetch effect resolve.
  await act(async () => { await Promise.resolve(); });
}

describe('StreamDeckSimRow', () => {
  it('lists every fetched model with its key count', async () => {
    await renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'devices.streamdeck.model' }));

    expect(screen.getByRole('option', {
      name: 'tools.streamdeckSim.modelOption:{"name":"Stream Deck Mini","count":6}',
    })).toBeInTheDocument();
    expect(screen.getByRole('option', {
      name: 'tools.streamdeckSim.modelOption:{"name":"Stream Deck MK.2","count":15}',
    })).toBeInTheDocument();
    expect(screen.getByRole('option', {
      name: 'tools.streamdeckSim.modelOption:{"name":"Stream Deck XL","count":32}',
    })).toBeInTheDocument();
  });

  it('connects the selected model and refreshes the deck list', async () => {
    await renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'devices.streamdeck.model' }));
    fireEvent.click(screen.getByRole('option', {
      name: 'tools.streamdeckSim.modelOption:{"name":"Stream Deck XL","count":32}',
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await act(async () => { await Promise.resolve(); });

    expect(mockSimulate).toHaveBeenCalledWith(108);
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('shows Disconnect while a simulated deck is active and clears it', async () => {
    mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
    await renderCard();

    const disconnect = screen.getByRole('button', { name: 'Disconnect' });
    fireEvent.click(disconnect);
    await act(async () => { await Promise.resolve(); });

    expect(mockClearSimulated).toHaveBeenCalled();
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('shows Connect (not Disconnect) when only a real, non-simulated deck is connected', async () => {
    mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck({ serial: 'REAL-SERIAL-1' })]));
    await renderCard();

    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disconnect' })).toBeNull();
  });

  describe('dial and touch input', () => {
    const PLUS = { serial: 'sim-0084', model: 'Plus', encoders: 4, screen: { width: 800, height: 100, kind: 'touchStrip' as const } };

    it('labels a model that has dials with its dial count', async () => {
      mockGetDevModels.mockResolvedValue([{ productId: 132, name: 'Plus', rows: 2, cols: 4, keyCount: 8, encoders: 4, screen: { width: 800, height: 100, kind: 'touchStrip' }, touchKeys: 0 }]);
      await renderCard();
      fireEvent.click(screen.getByRole('button', { name: 'devices.streamdeck.model' }));
      expect(screen.getByRole('option', {
        name: 'tools.streamdeckSim.modelOptionDials:{"name":"Stream Deck Plus","count":8,"dials":4}',
      })).toBeInTheDocument();
    });

    it('offers no input controls for a deck without dials or a strip', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      await renderCard();
      expect(screen.queryByRole('group', { name: 'tools.streamdeckSim.input.title' })).toBeNull();
    });

    it('turns the selected dial both ways by the chosen ticks, and presses and releases it', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck(PLUS)]));
      await renderCard();

      fireEvent.click(screen.getByRole('button', { name: 'tools.streamdeckSim.input.dial' }));
      fireEvent.click(screen.getByRole('option', { name: '3' }));
      fireEvent.click(screen.getByRole('button', { name: 'tools.streamdeckSim.input.ticks' }));
      fireEvent.click(screen.getByRole('option', { name: '5' }));

      fireEvent.click(screen.getByRole('button', { name: 'tools.streamdeckSim.input.turnLeft' }));
      expect(mockSimInput).toHaveBeenLastCalledWith({ serial: 'sim-0084', kind: 'rotate', index: 2, ticks: -5 });
      fireEvent.click(screen.getByRole('button', { name: 'tools.streamdeckSim.input.turnRight' }));
      expect(mockSimInput).toHaveBeenLastCalledWith({ serial: 'sim-0084', kind: 'rotate', index: 2, ticks: 5 });
      fireEvent.click(screen.getByRole('button', { name: 'tools.streamdeckSim.input.press' }));
      expect(mockSimInput).toHaveBeenLastCalledWith({ serial: 'sim-0084', kind: 'dialDown', index: 2 });
      fireEvent.click(screen.getByRole('button', { name: 'tools.streamdeckSim.input.release' }));
      expect(mockSimInput).toHaveBeenLastCalledWith({ serial: 'sim-0084', kind: 'dialUp', index: 2 });
    });

    it('taps and long-touches the middle of the chosen segment, and swipes both ways across the strip', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck(PLUS)]));
      await renderCard();

      fireEvent.click(screen.getByRole('button', { name: 'tools.streamdeckSim.input.segment' }));
      fireEvent.click(screen.getByRole('option', { name: '2' }));
      fireEvent.click(screen.getByRole('button', { name: 'tools.streamdeckSim.input.tap' }));
      expect(mockSimInput).toHaveBeenLastCalledWith({ serial: 'sim-0084', kind: 'tap', x: 300, y: 50 });
      fireEvent.click(screen.getByRole('button', { name: 'tools.streamdeckSim.input.longTouch' }));
      expect(mockSimInput).toHaveBeenLastCalledWith({ serial: 'sim-0084', kind: 'longTouch', x: 300, y: 50 });

      fireEvent.click(screen.getByRole('button', { name: 'tools.streamdeckSim.input.swipeLeft' }));
      expect(mockSimInput).toHaveBeenLastCalledWith({ serial: 'sim-0084', kind: 'swipe', x: 640, y: 50, x2: 160, y2: 50 });
      fireEvent.click(screen.getByRole('button', { name: 'tools.streamdeckSim.input.swipeRight' }));
      expect(mockSimInput).toHaveBeenLastCalledWith({ serial: 'sim-0084', kind: 'swipe', x: 160, y: 50, x2: 640, y2: 50 });
    });

    it('a dial-only screen deck (no touch) has dial controls but no touch controls', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck({ serial: 'sim-2b18', encoders: 2, screen: { width: 720, height: 384, kind: 'dialScreen' } })]));
      await renderCard();
      expect(screen.getByRole('button', { name: 'tools.streamdeckSim.input.turnLeft' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'tools.streamdeckSim.input.tap' })).toBeNull();
    });
  });
});
