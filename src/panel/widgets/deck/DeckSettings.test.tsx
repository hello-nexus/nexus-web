import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StreamDeckSummary } from '../../../api/streamdeck';
import type { DeckTarget } from './deckTarget';
import type { PanelWidget } from '../types';
import type { DeckConfig } from './types';

vi.mock('../common/AppPicker', () => ({ useAppIcon: () => null, AppPicker: () => null }));

const mockUseStreamDecks = vi.fn();
vi.mock('../../../hooks/useStreamDecks', () => ({
  useStreamDecks: (enabled: boolean) => mockUseStreamDecks(enabled),
}));

const mockUsePhysicalDeckTarget = vi.fn();
vi.mock('./usePhysicalDeckTarget', () => ({
  usePhysicalDeckTarget: (deck: StreamDeckSummary | null, folderPath: number[]) => mockUsePhysicalDeckTarget(deck, folderPath),
}));

import { DeckSettings } from './DeckSettings';

function makeWidget(deck: DeckConfig): PanelWidget {
  return { id: 'w1', type: 'deck', size: '2x2', col: 0, row: 0, config: { deck: deck as never } };
}

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

function fakePhysicalTarget(over: Partial<DeckTarget> = {}): DeckTarget {
  return {
    kind: 'physical',
    cols: 3,
    rows: 2,
    keyCount: 6,
    config: { pages: [{ slots: [] }] },
    updateSlot: vi.fn(),
    swapSlots: vi.fn(),
    addPage: vi.fn(),
    removePage: vi.fn(),
    ...over,
  };
}

function renderSettings(deck: DeckConfig = { pages: [{ slots: [{ label: 'existing' }] }] }) {
  const onUpdate = vi.fn();
  const utils = render(
    <DeckSettings
      widget={makeWidget(deck)}
      surface="desktop"
      onUpdate={onUpdate}
      onResize={vi.fn()}
      selectedSlot={0}
      onSelectedSlotChange={vi.fn()}
      editView={{ page: 0, folderPath: [] }}
      onEditViewChange={vi.fn()}
    />,
  );
  return { ...utils, onUpdate };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUsePhysicalDeckTarget.mockImplementation((deck: StreamDeckSummary | null) => (
    deck
      ? { target: fakePhysicalTarget(), loaded: true, error: false, retry: vi.fn() }
      : { target: null, loaded: false, error: false, retry: vi.fn() }
  ));
});

describe('DeckSettings physical-deck rail gating', () => {
  it('renders no rail and edits the widget config directly when no physical decks are detected', () => {
    mockUseStreamDecks.mockReturnValue({ decks: [], loaded: true, rename: vi.fn(), setBrightness: vi.fn(), refresh: vi.fn() });
    renderSettings();

    expect(screen.queryByRole('navigation')).toBeNull();
    // The inspector renders directly (unchanged from before the rail existed).
    expect(screen.getByText('panel.settings.icon')).toBeInTheDocument();
    expect(screen.getByText('panel.settings.deck.color')).toBeInTheDocument();
  });

  it('shows a rail with This widget plus each physical deck when at least one is detected', () => {
    mockUseStreamDecks.mockReturnValue({
      decks: [makeDeck()], loaded: true, rename: vi.fn(), setBrightness: vi.fn(), refresh: vi.fn(),
    });
    renderSettings();

    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByText('panel.settings.deck.rail.thisWidget')).toBeInTheDocument();
    expect(screen.getByText('My Mini Deck')).toBeInTheDocument();
  });

  it('switching the rail to a physical deck swaps the editor onto that target', () => {
    mockUseStreamDecks.mockReturnValue({
      decks: [makeDeck()], loaded: true, rename: vi.fn(), setBrightness: vi.fn(), refresh: vi.fn(),
    });
    const { container } = renderSettings();

    fireEvent.click(screen.getByText('My Mini Deck'));

    // The physical target's grid renders (6 keys: 3 cols x 2 rows, root level).
    expect(container.querySelectorAll('[data-deck-slot-index]')).toHaveLength(6);

    // Switching back to the widget hides the grid.
    fireEvent.click(screen.getByText('panel.settings.deck.rail.thisWidget'));
    expect(container.querySelectorAll('[data-deck-slot-index]')).toHaveLength(0);
  });

  it('shows a loading placeholder while the physical deck config has not loaded yet', () => {
    mockUseStreamDecks.mockReturnValue({
      decks: [makeDeck()], loaded: true, rename: vi.fn(), setBrightness: vi.fn(), refresh: vi.fn(),
    });
    mockUsePhysicalDeckTarget.mockReturnValue({ target: null, loaded: false });
    renderSettings();

    fireEvent.click(screen.getByText('My Mini Deck'));
    expect(screen.getByText('panel.settings.deck.rail.loadingConfig')).toBeInTheDocument();
  });

  it('gates physical-deck detection on desktop surface or desktopEditor', () => {
    mockUseStreamDecks.mockReturnValue({ decks: [], loaded: true, rename: vi.fn(), setBrightness: vi.fn(), refresh: vi.fn() });
    render(
      <DeckSettings
        widget={makeWidget({ pages: [{ slots: [] }] })}
        surface="y70"
        onUpdate={vi.fn()}
        onResize={vi.fn()}
      />,
    );
    expect(mockUseStreamDecks).toHaveBeenCalledWith(false);
  });

  it('shows a load-failed message with a retry action instead of the editor when the config fetch errored', () => {
    mockUseStreamDecks.mockReturnValue({
      decks: [makeDeck()], loaded: true, rename: vi.fn(), setBrightness: vi.fn(), refresh: vi.fn(),
    });
    const retry = vi.fn();
    mockUsePhysicalDeckTarget.mockReturnValue({ target: null, loaded: true, error: true, retry });
    renderSettings();

    fireEvent.click(screen.getByText('My Mini Deck'));

    expect(screen.getByText('panel.settings.deck.rail.loadFailed')).toBeInTheDocument();
    expect(screen.queryByText('panel.settings.deck.rail.loadingConfig')).toBeNull();

    fireEvent.click(screen.getByText('panel.settings.deck.rail.retry'));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
