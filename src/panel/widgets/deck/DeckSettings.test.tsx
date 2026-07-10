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
    config: { slots: [] },
    updateSlot: vi.fn(),
    swapSlots: vi.fn(),
    ...over,
  };
}

function renderSettings(deck: DeckConfig = { slots: [{ label: 'existing' }] }) {
  const onUpdate = vi.fn();
  const utils = render(
    <DeckSettings
      widget={makeWidget(deck)}
      surface="desktop"
      onUpdate={onUpdate}
      onResize={vi.fn()}
      selectedSlot={0}
      onSelectedSlotChange={vi.fn()}
      editView={{ folderPath: [] }}
      onEditViewChange={vi.fn()}
    />,
  );
  return { ...utils, onUpdate };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUsePhysicalDeckTarget.mockImplementation((deck: StreamDeckSummary | null) => (
    deck
      ? { target: fakePhysicalTarget(), loaded: true, error: false, retry: vi.fn(), replaceAll: vi.fn() }
      : { target: null, loaded: false, error: false, retry: vi.fn(), replaceAll: vi.fn() }
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
    expect(screen.queryByText('panel.settings.deck.copyLayout')).toBeNull();
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

  it('switching the rail to a physical deck swaps the editor onto that target and shows the copy button', () => {
    mockUseStreamDecks.mockReturnValue({
      decks: [makeDeck()], loaded: true, rename: vi.fn(), setBrightness: vi.fn(), refresh: vi.fn(),
    });
    const { container } = renderSettings();

    fireEvent.click(screen.getByText('My Mini Deck'));

    expect(screen.getByText('panel.settings.deck.copyLayout')).toBeInTheDocument();
    // The physical target's grid renders (6 keys: 3 cols x 2 rows, root level).
    expect(container.querySelectorAll('[data-deck-slot-index]')).toHaveLength(6);

    // Switching back to the widget hides the copy button and the grid.
    fireEvent.click(screen.getByText('panel.settings.deck.rail.thisWidget'));
    expect(screen.queryByText('panel.settings.deck.copyLayout')).toBeNull();
    expect(container.querySelectorAll('[data-deck-slot-index]')).toHaveLength(0);
  });

  it('shows a loading placeholder while the physical deck config has not loaded yet', () => {
    mockUseStreamDecks.mockReturnValue({
      decks: [makeDeck()], loaded: true, rename: vi.fn(), setBrightness: vi.fn(), refresh: vi.fn(),
    });
    mockUsePhysicalDeckTarget.mockReturnValue({ target: null, loaded: false, replaceAll: vi.fn() });
    renderSettings();

    fireEvent.click(screen.getByText('My Mini Deck'));
    expect(screen.getByText('panel.settings.deck.rail.loadingConfig')).toBeInTheDocument();
  });

  it('copy-widget-layout confirms then deep-copies the widget config into the physical target', () => {
    mockUseStreamDecks.mockReturnValue({
      decks: [makeDeck()], loaded: true, rename: vi.fn(), setBrightness: vi.fn(), refresh: vi.fn(),
    });
    const replaceAll = vi.fn();
    mockUsePhysicalDeckTarget.mockReturnValue({ target: fakePhysicalTarget(), loaded: true, replaceAll });

    const widgetDeck: DeckConfig = { slots: [{ label: 'from widget' }] };
    renderSettings(widgetDeck);

    fireEvent.click(screen.getByText('My Mini Deck'));
    fireEvent.click(screen.getByText('panel.settings.deck.copyLayout'));

    // Destructive-by-default confirm gates the actual copy.
    expect(replaceAll).not.toHaveBeenCalled();
    expect(screen.getByText('panel.settings.deck.copyLayoutConfirm.title')).toBeInTheDocument();

    fireEvent.click(screen.getByText('confirm.ok'));

    expect(replaceAll).toHaveBeenCalledTimes(1);
    const copied = replaceAll.mock.calls[0][0] as DeckConfig;
    expect(copied).toEqual(widgetDeck);
    expect(copied).not.toBe(widgetDeck);
  });

  it('gates physical-deck detection on desktop surface or desktopEditor', () => {
    mockUseStreamDecks.mockReturnValue({ decks: [], loaded: true, rename: vi.fn(), setBrightness: vi.fn(), refresh: vi.fn() });
    render(
      <DeckSettings
        widget={makeWidget({ slots: [] })}
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
    mockUsePhysicalDeckTarget.mockReturnValue({ target: null, loaded: true, error: true, retry, replaceAll: vi.fn() });
    renderSettings();

    fireEvent.click(screen.getByText('My Mini Deck'));

    expect(screen.getByText('panel.settings.deck.rail.loadFailed')).toBeInTheDocument();
    expect(screen.queryByText('panel.settings.deck.rail.loadingConfig')).toBeNull();
    expect(screen.queryByText('panel.settings.deck.copyLayout')).toBeNull();

    fireEvent.click(screen.getByText('panel.settings.deck.rail.retry'));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('warns of truncation and copies only what fits when the widget holds more slots than the deck', () => {
    mockUseStreamDecks.mockReturnValue({
      decks: [makeDeck({ keyCount: 2 })], loaded: true, rename: vi.fn(), setBrightness: vi.fn(), refresh: vi.fn(),
    });
    const replaceAll = vi.fn();
    mockUsePhysicalDeckTarget.mockReturnValue({
      target: fakePhysicalTarget({ keyCount: 2, cols: 2, rows: 1 }), loaded: true, error: false, retry: vi.fn(), replaceAll,
    });

    // 2x2 widget = 4 root slots, more than the deck's 2 keys.
    const widgetDeck: DeckConfig = { slots: [{ label: 'a' }, { label: 'b' }, { label: 'c' }, { label: 'd' }] };
    renderSettings(widgetDeck);

    fireEvent.click(screen.getByText('My Mini Deck'));
    fireEvent.click(screen.getByText('panel.settings.deck.copyLayout'));

    expect(screen.getByText('panel.settings.deck.copyLayoutConfirm.truncated')).toBeInTheDocument();

    fireEvent.click(screen.getByText('confirm.ok'));

    const copied = replaceAll.mock.calls[0][0] as DeckConfig;
    expect(copied.slots).toHaveLength(2);
    expect(copied.slots.map(s => s.label)).toEqual(['a', 'b']);
  });

  it('warns of truncation when only a nested folder overflows, even though the root slot count matches the deck exactly', () => {
    // 2x2 widget = 4 root slots, deck keyCount = 4: the root fits exactly, so a
    // root-keyCount comparison alone would miss this. The folder inside root
    // slot 0 holds 5 entries but the deck's folder view only has room for
    // keyCount - 1 = 3 (Back key reserved), so it overflows on its own.
    mockUseStreamDecks.mockReturnValue({
      decks: [makeDeck({ keyCount: 4 })], loaded: true, rename: vi.fn(), setBrightness: vi.fn(), refresh: vi.fn(),
    });
    mockUsePhysicalDeckTarget.mockReturnValue({
      target: fakePhysicalTarget({ keyCount: 4, cols: 2, rows: 2 }), loaded: true, error: false, retry: vi.fn(), replaceAll: vi.fn(),
    });

    const widgetDeck: DeckConfig = {
      slots: [
        { folder: { slots: Array.from({ length: 5 }, (_, i) => ({ label: `f${i}` })) } },
        { label: 'b' }, { label: 'c' }, { label: 'd' },
      ],
    };
    renderSettings(widgetDeck);

    fireEvent.click(screen.getByText('My Mini Deck'));
    fireEvent.click(screen.getByText('panel.settings.deck.copyLayout'));

    expect(screen.getByText('panel.settings.deck.copyLayoutConfirm.truncated')).toBeInTheDocument();
  });

  it('does not warn of truncation when the widget layout fits entirely, including all folders', () => {
    mockUseStreamDecks.mockReturnValue({
      decks: [makeDeck({ keyCount: 6 })], loaded: true, rename: vi.fn(), setBrightness: vi.fn(), refresh: vi.fn(),
    });
    mockUsePhysicalDeckTarget.mockReturnValue({
      target: fakePhysicalTarget({ keyCount: 6 }), loaded: true, error: false, retry: vi.fn(), replaceAll: vi.fn(),
    });

    const widgetDeck: DeckConfig = { slots: [{ folder: { slots: [{ label: 'inner' }] } }, { label: 'b' }] };
    renderSettings(widgetDeck);

    fireEvent.click(screen.getByText('My Mini Deck'));
    fireEvent.click(screen.getByText('panel.settings.deck.copyLayout'));

    expect(screen.queryByText('panel.settings.deck.copyLayoutConfirm.truncated')).toBeNull();
  });
});
