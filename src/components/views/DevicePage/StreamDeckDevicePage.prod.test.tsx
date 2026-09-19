import { act, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StreamDeckSummary } from '../../../api/streamdeck';
import type { UnifiedDevice } from '../../../hooks/useUnifiedDevices';
import type { DeckTarget } from '../../../panel/widgets/deck/deckTarget';
import type { UseDeckInstanceResult } from '../../../panel/widgets/deck/useDeckInstance';

// Force a production build: dev tools off. The device page itself never
// rendered a model chooser or test-pattern button even in dev builds (they
// live on the Tools page now); this asserts that stays true under DEV_TOOLS
// off too.
vi.mock('../../../lib/devTools', () => ({ DEV_TOOLS: false }));

vi.mock('../../../api/service', () => ({ isLocalhostUnreachable: () => false }));
vi.mock('../../../panel/widgets/common/AppPicker', () => ({ useAppIcon: () => null, AppPicker: () => null }));
vi.mock('../../../hooks/useConflictApps', () => ({
  useConflictApps: () => ({ conflicts: [], ready: true }),
}));
vi.mock('../../../panel/widgets/deck/DeckKeyInspector', () => ({
  DeckKeyInspector: () => <div data-testid="deck-key-inspector" />,
  DeckDefaultTitleSettings: () => <div data-testid="deck-default-title" />,
  slotForPickerKind: (_kind: string, base: object = {}) => base,
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
    updateSlot: vi.fn(), swapSlots: vi.fn(), addPage: vi.fn(), removePage: vi.fn(), setTitleDefault: vi.fn(),
  };
}

const mockUseStreamDecks = vi.fn();
vi.mock('../../../hooks/useStreamDecks', () => ({
  useStreamDecks: () => mockUseStreamDecks(),
}));
vi.mock('../../../panel/widgets/deck/useDeckInstance', () => ({
  useDeckInstance: (): UseDeckInstanceResult => ({
    instance: { mode: 'fixed', activePresetId: 'p1' },
    preset: { id: 'p1', name: 'Preset', cols: 3, rows: 2, pageCount: 1, deck: { pages: [{ slots: [] }] } },
    presets: [],
    target: fakeTarget(),
    loaded: true,
    error: false,
    retry: vi.fn(),
    setMode: vi.fn(),
    activate: vi.fn(),
    createPreset: vi.fn(),
    renamePreset: vi.fn(),
    deletePreset: vi.fn(),
    canUndo: false,
    canRedo: false,
    undo: vi.fn(),
    redo: vi.fn(),
    reset: vi.fn(),
    endEditBurst: vi.fn(),
  }),
}));

import { StreamDeckDevicePage } from './StreamDeckDevicePage';

const device: UnifiedDevice = {
  key: 'streamdeck:SN1',
  shortName: 'Stream Deck Mini',
  name: 'Stream Deck Mini',
  subtitle: 'controller',
  category: 'controller',
  iconSrc: '/assets/devices/elgato.svg',
  connected: true,
  kind: 'curated',
  curatedId: 'streamdeck',
  streamdeckSerial: 'SN1',
  navigable: true,
  nexusControlEnabled: true,
  supportsNexusControl: true,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('StreamDeckDevicePage without dev tools', () => {
  it('does not show a simulator on the not-connected empty state', async () => {
    mockUseStreamDecks.mockReturnValue({
      decks: [], loaded: true, rename: vi.fn(), setBrightness: vi.fn(),
      setOrientation: vi.fn(), setSleepAfterSeconds: vi.fn(), refresh: vi.fn(),
    });
    await act(async () => { render(<StreamDeckDevicePage device={device} controlDevice={vi.fn()} />); });

    expect(screen.getByText('devices.streamdeck.notConnected')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'devices.streamdeck.model' })).toBeNull();
  });

  it('does not show a model picker on the Settings tab', async () => {
    mockUseStreamDecks.mockReturnValue({
      decks: [makeDeck()], loaded: true, rename: vi.fn(), setBrightness: vi.fn(),
      setOrientation: vi.fn(), setSleepAfterSeconds: vi.fn(), refresh: vi.fn(),
    });
    await act(async () => { render(<StreamDeckDevicePage device={device} controlDevice={vi.fn()} />); });
    fireEvent.click(screen.getByRole('tab', { name: 'devices.streamdeck.tab.settings' }));

    expect(screen.queryByRole('button', { name: 'devices.streamdeck.model' })).toBeNull();
  });
});
