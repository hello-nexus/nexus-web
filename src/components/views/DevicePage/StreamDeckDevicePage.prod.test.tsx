import { act, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StreamDeckSummary } from '../../../api/streamdeck';
import type { UnifiedDevice } from '../../../hooks/useUnifiedDevices';
import type { DeckTarget } from '../../../panel/widgets/deck/deckTarget';

// Force a production build: dev tools off. The Stream Deck simulator picker
// (both the not-connected empty-state card and the Settings-tab "simulate a
// different model" row) and the pre-existing test-pattern button must all
// disappear - they are bench-only affordances with no server route in a
// release build.
vi.mock('../../../lib/devTools', () => ({ DEV_TOOLS: false }));

vi.mock('../../../api/service', () => ({ isRemoteOrigin: false }));
vi.mock('../../../panel/widgets/common/AppPicker', () => ({ useAppIcon: () => null, AppPicker: () => null }));
vi.mock('../../../hooks/useConflictApps', () => ({
  useConflictApps: () => ({ conflicts: [], ready: true }),
}));
vi.mock('../../../panel/widgets/deck/DeckKeyInspector', () => ({
  DeckKeyInspector: () => <div data-testid="deck-key-inspector" />,
}));

function makeDeck(over: Partial<StreamDeckSummary> = {}): StreamDeckSummary {
  return {
    serial: 'SN1', model: 'Mini', name: 'My Mini Deck', connected: true, verified: true,
    rows: 2, cols: 3, keyCount: 6, keyPixels: 80, format: 'bmp', brightness: 60,
    ...over,
  };
}

function fakeTarget(): DeckTarget {
  return {
    kind: 'physical', cols: 3, rows: 2, keyCount: 6, config: { pages: [{ slots: [] }] },
    updateSlot: vi.fn(), swapSlots: vi.fn(), addPage: vi.fn(), removePage: vi.fn(),
  };
}

const mockUseStreamDecks = vi.fn();
vi.mock('../../../hooks/useStreamDecks', () => ({
  useStreamDecks: () => mockUseStreamDecks(),
}));
vi.mock('../../../panel/widgets/deck/usePhysicalDeckTarget', () => ({
  usePhysicalDeckTarget: () => ({ target: fakeTarget(), loaded: true, error: false, retry: vi.fn() }),
}));

import { StreamDeckDevicePage } from './StreamDeckDevicePage';

const device: UnifiedDevice = {
  key: 'curated-streamdeck',
  shortName: 'Stream Deck',
  name: 'Stream Deck',
  subtitle: 'controller',
  category: 'controller',
  iconSrc: '/assets/devices/streamdeck.svg',
  connected: true,
  kind: 'curated',
  curatedId: 'streamdeck',
  navigable: true,
  nexusControlEnabled: true,
  supportsNexusControl: true,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('StreamDeckDevicePage without dev tools', () => {
  it('does not show the simulator card on the not-connected empty state', async () => {
    mockUseStreamDecks.mockReturnValue({
      decks: [], loaded: true, rename: vi.fn(), setBrightness: vi.fn(),
      setOrientation: vi.fn(), setSleepAfterSeconds: vi.fn(), refresh: vi.fn(),
    });
    await act(async () => { render(<StreamDeckDevicePage device={device} controlDevice={vi.fn()} />); });

    expect(screen.getByText('devices.streamdeck.notConnected')).toBeInTheDocument();
    expect(screen.queryByText('devices.streamdeck.simulate.title')).toBeNull();
  });

  it('does not show the model picker or the test-pattern button on the Settings tab', async () => {
    mockUseStreamDecks.mockReturnValue({
      decks: [makeDeck()], loaded: true, rename: vi.fn(), setBrightness: vi.fn(),
      setOrientation: vi.fn(), setSleepAfterSeconds: vi.fn(), refresh: vi.fn(),
    });
    await act(async () => { render(<StreamDeckDevicePage device={device} controlDevice={vi.fn()} />); });
    fireEvent.click(screen.getByRole('tab', { name: 'devices.streamdeck.tab.settings' }));

    expect(screen.queryByText('devices.streamdeck.simulate.changeModel')).toBeNull();
    expect(screen.queryByText('devices.streamdeck.simulate.button')).toBeNull();
    expect(screen.queryByText('devices.streamdeck.simulate.clearButton')).toBeNull();
    expect(screen.queryByText('devices.streamdeck.sendTestPattern')).toBeNull();
  });
});
