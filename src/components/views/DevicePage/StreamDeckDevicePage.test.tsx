import { act, render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StreamDeckSummary } from '../../../api/streamdeck';
import type { DeckTarget } from '../../../panel/widgets/deck/deckTarget';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../api/service', () => ({ isRemoteOrigin: false }));
vi.mock('../../../panel/widgets/common/AppPicker', () => ({ useAppIcon: () => null, AppPicker: () => null }));

// Real useTranslation returns the bare key (no interpolation) when there is no
// I18nProvider ancestor; the orientation/sleep-after option labels need the
// interpolated {n} to tell apart otherwise-identical option text.
vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));

const mockUseStreamDecks = vi.fn();
vi.mock('../../../hooks/useStreamDecks', () => ({
  useStreamDecks: () => mockUseStreamDecks(),
}));

const h = vi.hoisted(() => ({
  conflicts: [] as any[],
}));

vi.mock('../../../hooks/useConflictApps', () => ({
  useConflictApps: () => ({ conflicts: h.conflicts, ready: true }),
}));

const mockUsePhysicalDeckTarget = vi.fn();
vi.mock('../../../panel/widgets/deck/usePhysicalDeckTarget', () => ({
  usePhysicalDeckTarget: (deck: StreamDeckSummary | null) => mockUsePhysicalDeckTarget(deck),
}));

vi.mock('../../../panel/widgets/deck/DeckKeyInspector', () => ({
  DeckKeyInspector: ({ selectedSlot }: { selectedSlot?: number }) => (
    <div data-testid="deck-key-inspector">{selectedSlot}</div>
  ),
}));

const mockSendTestPattern = vi.fn();
const mockGetDevModels = vi.fn();
const mockSimulate = vi.fn();
const mockClearSimulated = vi.fn();
vi.mock('../../../api/streamdeck', async () => {
  const actual = await vi.importActual<typeof import('../../../api/streamdeck')>('../../../api/streamdeck');
  return {
    ...actual,
    sendStreamDeckTestPattern: (...a: unknown[]) => mockSendTestPattern(...a),
    getStreamDeckDevModels: (...a: unknown[]) => mockGetDevModels(...a),
    simulateStreamDeck: (...a: unknown[]) => mockSimulate(...a),
    clearSimulatedStreamDeck: (...a: unknown[]) => mockClearSimulated(...a),
  };
});

import { StreamDeckDevicePage } from './StreamDeckDevicePage';
import type { UnifiedDevice } from '../../../hooks/useUnifiedDevices';

function makeUnifiedDevice(over: Partial<UnifiedDevice> = {}): UnifiedDevice {
  return {
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
    ...over,
  };
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
    orientation: 0,
    sleepAfterSeconds: 0,
    ...over,
  };
}

function fakeTarget(): DeckTarget {
  return {
    kind: 'physical', cols: 3, rows: 2, keyCount: 6, config: { pages: [{ slots: [] }] },
    updateSlot: vi.fn(), swapSlots: vi.fn(), addPage: vi.fn(), removePage: vi.fn(),
  };
}

const mockRename = vi.fn();
const mockSetBrightness = vi.fn();
const mockSetOrientation = vi.fn();
const mockSetSleepAfterSeconds = vi.fn();
const mockRefresh = vi.fn();
const mockControlDevice = vi.fn();

function decksReturn(decks: StreamDeckSummary[], loaded = true) {
  return {
    decks, loaded, rename: mockRename, setBrightness: mockSetBrightness,
    setOrientation: mockSetOrientation, setSleepAfterSeconds: mockSetSleepAfterSeconds,
    refresh: mockRefresh,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.conflicts = [];
  mockRename.mockResolvedValue(true);
  mockSetBrightness.mockResolvedValue(true);
  mockSetOrientation.mockResolvedValue(true);
  mockSetSleepAfterSeconds.mockResolvedValue(true);
  mockControlDevice.mockResolvedValue(undefined);
  mockUsePhysicalDeckTarget.mockReturnValue({ target: fakeTarget(), loaded: true, error: false, retry: vi.fn() });
  mockGetDevModels.mockResolvedValue([]);
  mockSimulate.mockResolvedValue(true);
  mockClearSimulated.mockResolvedValue(true);
});

async function renderPage(device: UnifiedDevice = makeUnifiedDevice()) {
  let utils!: ReturnType<typeof render>;
  await act(async () => {
    utils = render(<StreamDeckDevicePage device={device} controlDevice={mockControlDevice} />);
  });
  return utils;
}

function switchToSettingsTab() {
  fireEvent.click(screen.getByRole('tab', { name: 'devices.streamdeck.tab.settings' }));
}

describe('StreamDeckDevicePage', () => {
  it('shows the not-connected empty state when loaded with zero decks', async () => {
    mockUseStreamDecks.mockReturnValue(decksReturn([]));
    await renderPage();
    expect(screen.getByText('devices.streamdeck.notConnected')).toBeInTheDocument();
    expect(screen.queryByTestId('deck-key-inspector')).toBeNull();
  });

  describe('dev-tools simulator picker (no hardware connected)', () => {
    it('lists the fetched models and simulates the selected one, then refreshes the deck list', async () => {
      mockGetDevModels.mockResolvedValue([
        { productId: 'mk2', name: 'Stream Deck MK.2', rows: 2, cols: 4, keyCount: 8 },
        { productId: 'xl', name: 'Stream Deck XL', rows: 4, cols: 8, keyCount: 32 },
      ]);
      mockUseStreamDecks.mockReturnValue(decksReturn([]));
      await renderPage();

      const button = screen.queryByText('devices.streamdeck.simulate.title');
      if (!button) return; // DEV_TOOLS off in this build; nothing to press.
      await act(async () => { await Promise.resolve(); });

      fireEvent.click(screen.getByRole('button', { name: 'devices.streamdeck.model' }));
      fireEvent.click(screen.getByRole('option', { name: 'Stream Deck XL' }));
      fireEvent.click(screen.getByText('devices.streamdeck.simulate.button'));
      await act(async () => { await Promise.resolve(); });

      expect(mockSimulate).toHaveBeenCalledWith('xl');
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it('renders both tabs, defaulting to Customize, and hosts the key inspector + grid for a connected deck', async () => {
    mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
    await renderPage();

    expect(screen.getByText('My Mini Deck')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'devices.streamdeck.tab.customize' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'devices.streamdeck.tab.settings' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('deck-key-inspector')).toBeInTheDocument();
  });

  it('renders one grid key per slot and selecting a key updates the inspector', async () => {
    mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
    const { container } = await renderPage();

    const cells = container.querySelectorAll('[data-deck-slot-index]');
    expect(cells).toHaveLength(6);

    fireEvent.click(cells[3]);
    expect(screen.getByTestId('deck-key-inspector').textContent).toBe('3');
  });

  it('shows the Elgato-conflict warning banner only when the deck reports one', async () => {
    mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck({ warning: 'elgato-software-running' })]));
    await renderPage();
    expect(screen.getByText('devices.streamdeck.elgatoConflict')).toBeInTheDocument();
  });

  it('does not show the warning banner when there is no warning', async () => {
    mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
    await renderPage();
    expect(screen.queryByText('devices.streamdeck.elgatoConflict')).toBeNull();
  });

  it('renders an End Task card once the conflicting app is confirmed running', async () => {
    h.conflicts = [{ id: 'elgato-stream-deck', displayName: 'Elgato Stream Deck', category: 'peripherals', processName: 'StreamDeck', pid: 99 }];
    mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck({ warning: 'elgato-software-running', conflictAppId: 'elgato-stream-deck' })]));
    await renderPage();

    expect(screen.getByText('Elgato Stream Deck')).toBeInTheDocument();
    expect(screen.getByText('PID 99')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'conflicts.modal.endTask' })).toBeInTheDocument();
  });

  it('shows an experimental chip only for an unverified model', async () => {
    mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck({ verified: false })]));
    await renderPage();
    expect(screen.getByText('devices.streamdeck.experimental')).toBeInTheDocument();
  });

  it('renames the deck through the rename hook', async () => {
    mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
    await renderPage();

    fireEvent.click(screen.getByText('My Mini Deck'));
    const input = screen.getByDisplayValue('My Mini Deck');
    fireEvent.change(input, { target: { value: 'Renamed Deck' } });
    fireEvent.blur(input);

    expect(mockRename).toHaveBeenCalledWith('SN1', 'Renamed Deck');
  });

  it('shows a deck picker only when more than one physical deck is connected', async () => {
    mockUseStreamDecks.mockReturnValue(decksReturn([
      makeDeck({ serial: 'SN1', name: 'Deck One' }), makeDeck({ serial: 'SN2', name: 'Deck Two' }),
    ]));
    await renderPage();
    expect(screen.getByRole('button', { name: 'devices.streamdeck.pickerAria' })).toBeInTheDocument();
  });

  it('does not show a deck picker for a single connected deck', async () => {
    mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
    await renderPage();
    expect(screen.queryByRole('button', { name: 'devices.streamdeck.pickerAria' })).toBeNull();
  });

  it('shows a generic loading state before the deck list has loaded (SMELL 3)', async () => {
    mockUseStreamDecks.mockReturnValue(decksReturn([], false));
    await renderPage();
    expect(screen.getByText('common.loading')).toBeInTheDocument();
    expect(screen.queryByText('devices.streamdeck.notConnected')).toBeNull();
  });

  it('shows a load-failed message with retry instead of the inspector when the physical config fetch errored', async () => {
    const retry = vi.fn();
    mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
    mockUsePhysicalDeckTarget.mockReturnValue({ target: null, loaded: true, error: true, retry });
    await renderPage();

    expect(screen.getByText('panel.settings.deck.rail.loadFailed')).toBeInTheDocument();
    expect(screen.queryByTestId('deck-key-inspector')).toBeNull();

    fireEvent.click(screen.getByText('panel.settings.deck.rail.retry'));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  describe('Settings tab', () => {
    it('commits brightness through the setBrightness hook on slider commit', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck({ brightness: 40 })]));
      await renderPage();
      switchToSettingsTab();

      const slider = screen.getByRole('slider', { name: 'devices.streamdeck.brightness' });
      fireEvent.change(slider, { target: { value: '75' } });
      fireEvent.pointerUp(slider);
      // Slider defers the commit one tick past pointerup (see Slider.tsx handleEnd).
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

      expect(mockSetBrightness).toHaveBeenCalledWith('SN1', 75);
    });

    it('commits a new orientation through the setOrientation hook', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck({ orientation: 0 })]));
      await renderPage();
      switchToSettingsTab();

      fireEvent.click(screen.getByRole('button', { name: 'devices.streamdeck.orientation' }));
      fireEvent.click(screen.getByRole('option', { name: 'devices.streamdeck.orientationDegrees:{"n":90}' }));

      expect(mockSetOrientation).toHaveBeenCalledWith('SN1', 90);
    });

    it('shows Standard for orientation 0 and a degree label for a rotated deck', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck({ orientation: 180 })]));
      await renderPage();
      switchToSettingsTab();

      // The trigger's aria-label is the row label, so the selected value only
      // shows up as visible text, not as the button's accessible name.
      expect(screen.getByText('devices.streamdeck.orientationDegrees:{"n":180}')).toBeInTheDocument();
    });

    it('commits a new sleep-after duration through the setSleepAfterSeconds hook', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck({ sleepAfterSeconds: 0 })]));
      await renderPage();
      switchToSettingsTab();

      fireEvent.click(screen.getByRole('button', { name: 'devices.streamdeck.sleepAfter' }));
      fireEvent.click(screen.getByRole('option', { name: 'devices.streamdeck.sleepAfterMinutes:{"n":5}' }));

      expect(mockSetSleepAfterSeconds).toHaveBeenCalledWith('SN1', 300);
    });

    it('shows Never for a disabled sleep-after timer', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck({ sleepAfterSeconds: 0 })]));
      await renderPage();
      switchToSettingsTab();

      expect(screen.getByText('devices.streamdeck.sleepAfterNever')).toBeInTheDocument();
    });

    it('shows the firmware version and serial number as read-only rows', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck({ firmwareVersion: '1.2.3' })]));
      await renderPage();
      switchToSettingsTab();

      expect(screen.getByText('1.2.3')).toBeInTheDocument();
      expect(screen.getByText('SN1')).toBeInTheDocument();
    });

    it('hides the firmware row when the deck reports no firmware version', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck({ firmwareVersion: '' })]));
      await renderPage();
      switchToSettingsTab();

      expect(screen.queryByText('devices.streamdeck.firmware')).toBeNull();
    });

    it('sends a test pattern for the active deck when the dev-tools action is pressed', async () => {
      mockSendTestPattern.mockResolvedValue(true);
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      await renderPage();
      switchToSettingsTab();

      const button = screen.queryByText('devices.streamdeck.sendTestPattern');
      if (!button) return; // DEV_TOOLS off in this build; nothing to press.
      fireEvent.click(button);
      await act(async () => { await Promise.resolve(); });
      expect(mockSendTestPattern).toHaveBeenCalledWith('SN1');
    });

    it('simulates a different model and clears the simulation from the Settings tab', async () => {
      mockGetDevModels.mockResolvedValue([
        { productId: 'mk2', name: 'Stream Deck MK.2', rows: 2, cols: 4, keyCount: 8 },
      ]);
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      await renderPage();
      switchToSettingsTab();

      const label = screen.queryByText('devices.streamdeck.simulate.changeModel');
      if (!label) return; // DEV_TOOLS off in this build; nothing to press.
      await act(async () => { await Promise.resolve(); });

      fireEvent.click(screen.getByText('devices.streamdeck.simulate.button'));
      await act(async () => { await Promise.resolve(); });
      expect(mockSimulate).toHaveBeenCalledWith('mk2');
      expect(mockRefresh).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByText('devices.streamdeck.simulate.clearButton'));
      await act(async () => { await Promise.resolve(); });
      expect(mockClearSimulated).toHaveBeenCalledTimes(1);
      expect(mockRefresh).toHaveBeenCalledTimes(2);
    });

    it('toggles Nexus Link through controlDevice using the resolved device curatedId', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      await renderPage(makeUnifiedDevice({ curatedId: 'streamdeck', nexusControlEnabled: true }));
      switchToSettingsTab();

      const toggle = screen.getByRole('switch', { name: 'devices.nexusControl' });
      expect(toggle).not.toBeDisabled();
      fireEvent.click(toggle);

      expect(mockControlDevice).toHaveBeenCalledWith('streamdeck', false);
    });
  });
});
