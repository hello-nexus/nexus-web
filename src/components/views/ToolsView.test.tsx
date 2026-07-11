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
vi.mock('../../api/streamdeck', async () => {
  const actual = await vi.importActual<typeof import('../../api/streamdeck')>('../../api/streamdeck');
  return {
    ...actual,
    getStreamDeckDevModels: (...a: unknown[]) => mockGetDevModels(...a),
    simulateStreamDeck: (...a: unknown[]) => mockSimulate(...a),
    clearSimulatedStreamDeck: (...a: unknown[]) => mockClearSimulated(...a),
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
    { productId: 'mini', name: 'Mini', rows: 2, cols: 3, keyCount: 6 },
    { productId: 'mk2', name: 'MK.2', rows: 3, cols: 5, keyCount: 15 },
    { productId: 'xl', name: 'XL', rows: 4, cols: 8, keyCount: 32 },
  ]);
  mockSimulate.mockResolvedValue(true);
  mockClearSimulated.mockResolvedValue(true);
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

    expect(mockSimulate).toHaveBeenCalledWith('xl');
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
});
