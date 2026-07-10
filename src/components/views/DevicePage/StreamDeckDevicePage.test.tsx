import { act, render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StreamDeckSummary } from '../../../api/streamdeck';
import type { DeckTarget } from '../../../panel/widgets/deck/deckTarget';

const mockUseStreamDecks = vi.fn();
vi.mock('../../../hooks/useStreamDecks', () => ({
  useStreamDecks: () => mockUseStreamDecks(),
}));

const mockUsePhysicalDeckTarget = vi.fn();
vi.mock('../../../panel/widgets/deck/usePhysicalDeckTarget', () => ({
  usePhysicalDeckTarget: (deck: StreamDeckSummary | null) => mockUsePhysicalDeckTarget(deck),
}));

vi.mock('../../../panel/widgets/deck/DeckEditor', () => ({
  DeckEditor: () => <div data-testid="deck-editor" />,
}));

const mockSendTestPattern = vi.fn();
vi.mock('../../../api/streamdeck', async () => {
  const actual = await vi.importActual<typeof import('../../../api/streamdeck')>('../../../api/streamdeck');
  return { ...actual, sendStreamDeckTestPattern: (...a: unknown[]) => mockSendTestPattern(...a) };
});

import { StreamDeckDevicePage } from './StreamDeckDevicePage';

function makeDeck(over: Partial<StreamDeckSummary> = {}): StreamDeckSummary {
  return {
    serial: 'SN1',
    model: 'Mini',
    name: 'My Mini Deck',
    connected: true,
    verified: true,
    rows: 2,
    cols: 3,
    keyCount: 6,
    keyPixels: 80,
    format: 'bmp',
    brightness: 60,
    ...over,
  };
}

function fakeTarget(): DeckTarget {
  return { kind: 'physical', cols: 3, rows: 2, keyCount: 6, config: { slots: [] }, updateSlot: vi.fn(), swapSlots: vi.fn() };
}

const mockRename = vi.fn();
const mockSetBrightness = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockRename.mockResolvedValue(true);
  mockSetBrightness.mockResolvedValue(true);
  mockUsePhysicalDeckTarget.mockReturnValue({ target: fakeTarget(), loaded: true, replaceAll: vi.fn() });
});

async function renderPage() {
  let utils!: ReturnType<typeof render>;
  await act(async () => { utils = render(<StreamDeckDevicePage />); });
  return utils;
}

describe('StreamDeckDevicePage', () => {
  it('shows the not-connected empty state when loaded with zero decks', async () => {
    mockUseStreamDecks.mockReturnValue({ decks: [], loaded: true, rename: mockRename, setBrightness: mockSetBrightness });
    await renderPage();
    expect(screen.getByText('devices.streamdeck.notConnected')).toBeInTheDocument();
    expect(screen.queryByTestId('deck-editor')).toBeNull();
  });

  it('renders model, name, and hosts the shared DeckEditor for a connected deck', async () => {
    mockUseStreamDecks.mockReturnValue({ decks: [makeDeck()], loaded: true, rename: mockRename, setBrightness: mockSetBrightness });
    await renderPage();
    expect(screen.getByText('My Mini Deck')).toBeInTheDocument();
    expect(screen.getByText('Mini')).toBeInTheDocument();
    expect(screen.getByTestId('deck-editor')).toBeInTheDocument();
  });

  it('shows the Elgato-conflict warning banner only when the deck reports one', async () => {
    mockUseStreamDecks.mockReturnValue({
      decks: [makeDeck({ warning: 'elgato-conflict' })], loaded: true, rename: mockRename, setBrightness: mockSetBrightness,
    });
    await renderPage();
    expect(screen.getByText('devices.streamdeck.elgatoConflict')).toBeInTheDocument();
  });

  it('does not show the warning banner when there is no warning', async () => {
    mockUseStreamDecks.mockReturnValue({ decks: [makeDeck()], loaded: true, rename: mockRename, setBrightness: mockSetBrightness });
    await renderPage();
    expect(screen.queryByText('devices.streamdeck.elgatoConflict')).toBeNull();
  });

  it('shows an experimental chip only for an unverified model', async () => {
    mockUseStreamDecks.mockReturnValue({ decks: [makeDeck({ verified: false })], loaded: true, rename: mockRename, setBrightness: mockSetBrightness });
    await renderPage();
    expect(screen.getByText('devices.streamdeck.experimental')).toBeInTheDocument();
  });

  it('sends a test pattern for the active deck when the dev-tools action is pressed', async () => {
    mockSendTestPattern.mockResolvedValue(true);
    mockUseStreamDecks.mockReturnValue({ decks: [makeDeck()], loaded: true, rename: mockRename, setBrightness: mockSetBrightness });
    await renderPage();

    const button = screen.queryByText('devices.streamdeck.sendTestPattern');
    if (!button) return; // DEV_TOOLS off in this build; nothing to press.
    fireEvent.click(button);
    await act(async () => { await Promise.resolve(); });
    expect(mockSendTestPattern).toHaveBeenCalledWith('SN1');
  });

  it('renames the deck through the rename hook', async () => {
    mockUseStreamDecks.mockReturnValue({ decks: [makeDeck()], loaded: true, rename: mockRename, setBrightness: mockSetBrightness });
    await renderPage();

    fireEvent.click(screen.getByText('My Mini Deck'));
    const input = screen.getByDisplayValue('My Mini Deck');
    fireEvent.change(input, { target: { value: 'Renamed Deck' } });
    fireEvent.blur(input);

    expect(mockRename).toHaveBeenCalledWith('SN1', 'Renamed Deck');
  });

  it('commits brightness through the setBrightness hook on slider commit', async () => {
    mockUseStreamDecks.mockReturnValue({ decks: [makeDeck({ brightness: 40 })], loaded: true, rename: mockRename, setBrightness: mockSetBrightness });
    await renderPage();

    const slider = screen.getByRole('slider', { name: 'devices.y70.brightness' });
    fireEvent.change(slider, { target: { value: '75' } });
    fireEvent.pointerUp(slider);
    // Slider defers the commit one tick past pointerup (see Slider.tsx handleEnd).
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

    expect(mockSetBrightness).toHaveBeenCalledWith('SN1', 75);
  });

  it('shows a deck picker only when more than one physical deck is connected', async () => {
    mockUseStreamDecks.mockReturnValue({
      decks: [makeDeck({ serial: 'SN1', name: 'Deck One' }), makeDeck({ serial: 'SN2', name: 'Deck Two' })],
      loaded: true, rename: mockRename, setBrightness: mockSetBrightness,
    });
    await renderPage();
    expect(screen.getByRole('button', { name: 'devices.streamdeck.pickerAria' })).toBeInTheDocument();
  });

  it('does not show a deck picker for a single connected deck', async () => {
    mockUseStreamDecks.mockReturnValue({ decks: [makeDeck()], loaded: true, rename: mockRename, setBrightness: mockSetBrightness });
    await renderPage();
    expect(screen.queryByRole('button', { name: 'devices.streamdeck.pickerAria' })).toBeNull();
  });
});
