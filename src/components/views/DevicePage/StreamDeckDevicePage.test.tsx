import { act, render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StreamDeckSummary } from '../../../api/streamdeck';
import type { DeckTarget } from '../../../panel/widgets/deck/deckTarget';
import { emptyDeck } from '../../../panel/widgets/deck/deckLayout';
import type { DeckConfig } from '../../../panel/widgets/deck/types';

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
  usePhysicalDeckTarget: (deck: StreamDeckSummary | null, onCommit?: (prev: DeckConfig) => void) =>
    mockUsePhysicalDeckTarget(deck, onCommit),
}));

const mockUseDeckPresets = vi.fn();
vi.mock('../../../panel/widgets/deck/useDeckPresets', () => ({
  useDeckPresets: () => mockUseDeckPresets(),
  AUTO_SAVE_DEBOUNCE_MS: 1000,
}));

const mockSetStreamDeckNav = vi.fn();
vi.mock('../../../api/streamdeck', () => ({
  setStreamDeckNav: (serial: string, page: number, folderPath: readonly number[]) => mockSetStreamDeckNav(serial, page, folderPath),
}));

let capturedNavCallback: ((data: unknown) => void) | null = null;
vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: (_topic: string, enabled: boolean, cb: (data: unknown) => void) => {
    capturedNavCallback = enabled ? cb : null;
  },
}));

vi.mock('../../../panel/widgets/deck/DeckKeyInspector', () => ({
  DeckKeyInspector: ({ selectedSlot, part }: { selectedSlot?: number; part?: string }) => (
    <div data-testid={`deck-key-inspector-${part ?? 'all'}`}>{selectedSlot}</div>
  ),
  DeckDefaultTitleSettings: () => <div data-testid="deck-default-title" />,
  slotForPickerKind: (_kind: string, base: object = {}) => base,
}));

import { StreamDeckDevicePage } from './StreamDeckDevicePage';
import type { UnifiedDevice } from '../../../hooks/useUnifiedDevices';

function makeUnifiedDevice(over: Partial<UnifiedDevice> = {}): UnifiedDevice {
  return {
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

/** The onCommit callback StreamDeckDevicePage passed into the (mocked) usePhysicalDeckTarget on its most recent call - invoking it simulates the target's update path committing an edit. */
function latestOnCommit(): (prev: DeckConfig) => void {
  const calls = mockUsePhysicalDeckTarget.mock.calls;
  const args = calls[calls.length - 1] as [unknown, (prev: DeckConfig) => void];
  return args[1];
}

function fakeTargetWithPages(pages: DeckTarget['config']['pages']): DeckTarget {
  return { ...fakeTarget(), config: { pages } };
}

const mockRename = vi.fn();
const mockSetBrightness = vi.fn();
const mockSetOrientation = vi.fn();
const mockSetSleepAfterSeconds = vi.fn();
const mockRefresh = vi.fn();
const mockControlDevice = vi.fn();
const mockDeckPresetHandleLoad = vi.fn();
const mockDeckPresetHandleCreate = vi.fn();
const mockDeckPresetHandleRename = vi.fn();
const mockDeckPresetHandleDelete = vi.fn();
const mockScheduleAutoSave = vi.fn();
const mockApplyConfig = vi.fn();

function deckPresetsReturn(over: Partial<{ presets: Array<{ id: string; name: string }>; activeId: string | null; presetCount: number; available: boolean }> = {}) {
  return {
    presets: [], activeId: null, presetCount: 0, available: false,
    loadPresets: vi.fn(), handleCreate: mockDeckPresetHandleCreate,
    handleRename: mockDeckPresetHandleRename, handleDelete: mockDeckPresetHandleDelete,
    handleLoad: mockDeckPresetHandleLoad,
    scheduleAutoSave: mockScheduleAutoSave,
    ...over,
  };
}

function decksReturn(decks: StreamDeckSummary[], loaded = true) {
  return {
    decks, loaded, rename: mockRename, setBrightness: mockSetBrightness,
    setOrientation: mockSetOrientation, setSleepAfterSeconds: mockSetSleepAfterSeconds,
    refresh: mockRefresh,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedNavCallback = null;
  h.conflicts = [];
  mockRename.mockResolvedValue(true);
  mockSetBrightness.mockResolvedValue(true);
  mockSetOrientation.mockResolvedValue(true);
  mockSetSleepAfterSeconds.mockResolvedValue(true);
  mockControlDevice.mockResolvedValue(undefined);
  mockSetStreamDeckNav.mockResolvedValue(true);
  mockUsePhysicalDeckTarget.mockReturnValue({ target: fakeTarget(), loaded: true, error: false, retry: vi.fn(), applyConfig: mockApplyConfig });
  mockUseDeckPresets.mockReturnValue(deckPresetsReturn());
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
    expect(screen.queryByTestId('deck-key-inspector-editor')).toBeNull();
  });

  it('does not offer a simulator on the not-connected empty state (moved to dev tools)', async () => {
    mockUseStreamDecks.mockReturnValue(decksReturn([]));
    await renderPage();
    expect(screen.queryByRole('button', { name: 'devices.streamdeck.model' })).toBeNull();
  });

  it('renders both tabs, defaulting to Customize, and hosts the key inspector + grid for a connected deck', async () => {
    mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
    await renderPage();

    expect(screen.getByRole('tab', { name: 'devices.streamdeck.tab.customize' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'devices.streamdeck.tab.settings' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('deck-key-inspector-editor')).toBeInTheDocument();
  });

  it('renders one grid key per slot and selecting a key updates the inspector', async () => {
    mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
    const { container } = await renderPage();

    const cells = container.querySelectorAll('[data-deck-slot-index]');
    expect(cells).toHaveLength(6);

    fireEvent.click(cells[3]);
    expect(screen.getByTestId('deck-key-inspector-editor').textContent).toBe('3');
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

  it('renames the deck through the rename hook from the Settings tab', async () => {
    mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
    await renderPage();
    switchToSettingsTab();

    fireEvent.click(screen.getByText('My Mini Deck'));
    const input = screen.getByDisplayValue('My Mini Deck');
    fireEvent.change(input, { target: { value: 'Renamed Deck' } });
    fireEvent.blur(input);

    expect(mockRename).toHaveBeenCalledWith('SN1', 'Renamed Deck');
  });

  it('shows exactly the deck matching the entry\'s serial when multiple decks are loaded', async () => {
    mockUseStreamDecks.mockReturnValue(decksReturn([
      makeDeck({ serial: 'SN1', name: 'Deck One' }), makeDeck({ serial: 'SN2', name: 'Deck Two' }),
    ]));
    await renderPage(makeUnifiedDevice({ key: 'streamdeck:SN2', streamdeckSerial: 'SN2' }));
    switchToSettingsTab();

    expect(screen.getByText('SN2')).toBeInTheDocument();
    expect(screen.queryByText('SN1')).toBeNull();
    expect(screen.getByText('Deck Two')).toBeInTheDocument();
    expect(screen.queryByText('Deck One')).toBeNull();
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
    expect(screen.queryByTestId('deck-key-inspector-editor')).toBeNull();

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

    it('no longer offers the Nexus Link toggle (moved to dev tools)', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      await renderPage(makeUnifiedDevice({ curatedId: 'streamdeck', nexusControlEnabled: true }));
      switchToSettingsTab();

      expect(screen.queryByRole('switch', { name: 'devices.nexusControl' })).toBeNull();
    });
  });

  describe('Customize tab layout', () => {
    it('has no model dropdown - the connected deck is shown without a chooser', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      await renderPage();

      expect(screen.queryByRole('button', { name: 'devices.streamdeck.model' })).toBeNull();
    });

    it('labels the tab strip with the model name from the deck DTO', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck({ model: 'Mini' })]));
      await renderPage();

      // The model name is the page's top-bar title (set in Dashboard) + the tab
      // strip's aria-label; it is no longer rendered as body text in the page.
      expect(screen.getByRole('tablist', { name: 'devices.streamdeck.modelName:{"model":"Mini"}' })).toBeInTheDocument();
    });

    it('shows pagination as plain page-number chips, not "Page N" tabs', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      await renderPage();

      // The Customize/Settings ViewHeader tabs are the only role="tab"
      // elements - pagination itself must not add another tab strip.
      const tabNames = screen.getAllByRole('tab').map(tab => tab.textContent);
      expect(tabNames).toEqual(['devices.streamdeck.tab.customize', 'devices.streamdeck.tab.settings']);
      expect(screen.getByText('1')).toBeInTheDocument();
    });

    it('docks the grid preview above the editor on the left, with the action picker on the right', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      const { container } = await renderPage();

      const grid = container.querySelector('[data-deck-slot-index]')!;
      const editor = screen.getByTestId('deck-key-inspector-editor');
      const picker = screen.getByTestId('deck-key-inspector-picker');
      // Left column: preview grid docked at the top, the key editor below it.
      expect(!!(grid.compareDocumentPosition(editor) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
      // Right column: the action picker follows the whole left column in DOM order.
      expect(!!(editor.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    });
  });

  describe('Presets toolbar', () => {
    it('is hidden when the preset routes are unavailable (older service build / 404)', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      mockUseDeckPresets.mockReturnValue(deckPresetsReturn({ available: false }));
      await renderPage();

      expect(screen.queryByRole('button', { name: 'lighting.layoutPresets.placeholder' })).toBeNull();
    });

    it('renders top-right on the Customize tab once the preset routes are available', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      mockUseDeckPresets.mockReturnValue(deckPresetsReturn({
        available: true, presets: [{ id: 'p1', name: 'Streaming layout' }], activeId: 'p1', presetCount: 1,
      }));
      await renderPage();

      expect(screen.getByRole('button', { name: 'lighting.layoutPresets.placeholder' })).toBeInTheDocument();
    });

    it('is not shown on the Settings tab', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      mockUseDeckPresets.mockReturnValue(deckPresetsReturn({ available: true, presets: [{ id: 'p1', name: 'A' }], activeId: 'p1', presetCount: 1 }));
      await renderPage();
      switchToSettingsTab();

      expect(screen.queryByRole('button', { name: 'lighting.layoutPresets.placeholder' })).toBeNull();
    });

    it('shows Reset/Undo/Redo controls, with Undo/Redo disabled until a config edit is committed', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      mockUseDeckPresets.mockReturnValue(deckPresetsReturn({ available: true, presets: [{ id: 'p1', name: 'A' }], activeId: 'p1', presetCount: 1 }));
      await renderPage();

      expect(screen.getByRole('button', { name: 'devices.streamdeck.presets.reset' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'lighting.layoutPresets.undo' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'lighting.layoutPresets.redo' })).toBeDisabled();
    });

    it('a committed config edit pushes undo history and schedules the preset auto-save', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      mockUseDeckPresets.mockReturnValue(deckPresetsReturn({ available: true, presets: [{ id: 'p1', name: 'A' }], activeId: 'p1', presetCount: 1 }));
      await renderPage();

      const onCommit = latestOnCommit();
      act(() => { onCommit({ pages: [{ slots: [{ label: 'before' }] }] }); });

      expect(mockScheduleAutoSave).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'lighting.layoutPresets.undo' })).not.toBeDisabled();
    });

    it('clicking Undo restores the pre-edit config through applyConfig and re-schedules auto-save', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      mockUseDeckPresets.mockReturnValue(deckPresetsReturn({ available: true, presets: [{ id: 'p1', name: 'A' }], activeId: 'p1', presetCount: 1 }));
      await renderPage();

      const priorConfig: DeckConfig = { pages: [{ slots: [{ label: 'before' }] }] };
      act(() => { latestOnCommit()(priorConfig); });
      mockScheduleAutoSave.mockClear();

      fireEvent.click(screen.getByRole('button', { name: 'lighting.layoutPresets.undo' }));

      expect(mockApplyConfig).toHaveBeenCalledWith(priorConfig);
      expect(mockScheduleAutoSave).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'lighting.layoutPresets.undo' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'lighting.layoutPresets.redo' })).not.toBeDisabled();
    });

    it('clicking Redo after an Undo re-applies the undone config and re-schedules auto-save', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      mockUseDeckPresets.mockReturnValue(deckPresetsReturn({ available: true, presets: [{ id: 'p1', name: 'A' }], activeId: 'p1', presetCount: 1 }));
      await renderPage();

      const priorConfig: DeckConfig = { pages: [{ slots: [{ label: 'before' }] }] };
      act(() => { latestOnCommit()(priorConfig); });
      fireEvent.click(screen.getByRole('button', { name: 'lighting.layoutPresets.undo' }));
      mockApplyConfig.mockClear();
      mockScheduleAutoSave.mockClear();

      fireEvent.click(screen.getByRole('button', { name: 'lighting.layoutPresets.redo' }));

      // The target's current config is the fakeTarget() default - what Undo
      // moved onto the redo stack - so Redo hands it back to applyConfig.
      expect(mockApplyConfig).toHaveBeenCalledWith({ pages: [{ slots: [] }] });
      expect(mockScheduleAutoSave).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'lighting.layoutPresets.redo' })).toBeDisabled();
    });

    it('Reset (after confirm) clears the config to a single empty page, is itself undoable, and schedules auto-save', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      mockUseDeckPresets.mockReturnValue(deckPresetsReturn({ available: true, presets: [{ id: 'p1', name: 'A' }], activeId: 'p1', presetCount: 1 }));
      await renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'devices.streamdeck.presets.reset' }));
      fireEvent.click(screen.getByRole('button', { name: 'confirm.ok' }));

      expect(mockApplyConfig).toHaveBeenCalledWith(emptyDeck());
      expect(mockScheduleAutoSave).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'lighting.layoutPresets.undo' })).not.toBeDisabled();
    });

    it('loading a preset activates it then re-fetches the physical deck config', async () => {
      const retry = vi.fn();
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      mockUsePhysicalDeckTarget.mockReturnValue({ target: fakeTarget(), loaded: true, error: false, retry, applyConfig: mockApplyConfig });
      mockUseDeckPresets.mockReturnValue(deckPresetsReturn({ available: true, presets: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }], activeId: 'p1', presetCount: 2 }));
      mockDeckPresetHandleLoad.mockResolvedValue(undefined);
      await renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'lighting.layoutPresets.placeholder' }));
      await act(async () => {
        fireEvent.click(screen.getByRole('option', { name: 'B' }));
        await Promise.resolve();
      });

      expect(mockDeckPresetHandleLoad).toHaveBeenCalledWith('p2');
      expect(retry).toHaveBeenCalledTimes(1);
    });

    describe('undo-history burst coalescing', () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
      });

      it('collapses a rapid run of commits into one history entry anchored on the first prev', async () => {
        mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
        mockUseDeckPresets.mockReturnValue(deckPresetsReturn({ available: true, presets: [{ id: 'p1', name: 'A' }], activeId: 'p1', presetCount: 1 }));
        await renderPage();

        const first: DeckConfig = { pages: [{ slots: [{ label: 'M' }] }] };
        const second: DeckConfig = { pages: [{ slots: [{ label: 'Mu' }] }] };
        const third: DeckConfig = { pages: [{ slots: [{ label: 'Mus' }] }] };
        const onCommit = latestOnCommit();

        act(() => { onCommit(first); });
        expect(screen.getByRole('button', { name: 'lighting.layoutPresets.undo' })).not.toBeDisabled();
        act(() => { vi.advanceTimersByTime(200); });
        act(() => { onCommit(second); });
        act(() => { vi.advanceTimersByTime(200); });
        act(() => { onCommit(third); });

        fireEvent.click(screen.getByRole('button', { name: 'lighting.layoutPresets.undo' }));

        expect(mockApplyConfig).toHaveBeenCalledTimes(1);
        expect(mockApplyConfig).toHaveBeenCalledWith(first);
        expect(screen.getByRole('button', { name: 'lighting.layoutPresets.undo' })).toBeDisabled();
      });

      it('starts a new history entry once the coalescing window has elapsed since the last commit', async () => {
        mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
        mockUseDeckPresets.mockReturnValue(deckPresetsReturn({ available: true, presets: [{ id: 'p1', name: 'A' }], activeId: 'p1', presetCount: 1 }));
        await renderPage();

        const first: DeckConfig = { pages: [{ slots: [{ label: 'M' }] }] };
        const second: DeckConfig = { pages: [{ slots: [{ label: 'Music' }] }] };
        const onCommit = latestOnCommit();

        act(() => { onCommit(first); });
        act(() => { vi.advanceTimersByTime(1000); });
        act(() => { onCommit(second); });

        fireEvent.click(screen.getByRole('button', { name: 'lighting.layoutPresets.undo' }));
        expect(mockApplyConfig).toHaveBeenCalledWith(second);
        expect(screen.getByRole('button', { name: 'lighting.layoutPresets.undo' })).not.toBeDisabled();

        mockApplyConfig.mockClear();
        fireEvent.click(screen.getByRole('button', { name: 'lighting.layoutPresets.undo' }));
        expect(mockApplyConfig).toHaveBeenCalledWith(first);
        expect(screen.getByRole('button', { name: 'lighting.layoutPresets.undo' })).toBeDisabled();
      });

      it('closes an open burst on Undo so the next edit starts its own entry instead of being coalesced into the stale burst', async () => {
        mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
        mockUseDeckPresets.mockReturnValue(deckPresetsReturn({ available: true, presets: [{ id: 'p1', name: 'A' }], activeId: 'p1', presetCount: 1 }));
        await renderPage();

        const anchor: DeckConfig = { pages: [{ slots: [{ label: 'before' }] }] };
        const onCommit = latestOnCommit();

        act(() => { onCommit(anchor); });
        fireEvent.click(screen.getByRole('button', { name: 'lighting.layoutPresets.undo' }));
        expect(mockApplyConfig).toHaveBeenCalledWith(anchor);
        expect(screen.getByRole('button', { name: 'lighting.layoutPresets.undo' })).toBeDisabled();

        mockApplyConfig.mockClear();
        const postUndoEdit: DeckConfig = { pages: [{ slots: [{ label: 'after-undo' }] }] };
        // Still inside what would have been the flushed burst's window - the
        // burst must already be closed, or this looks like a continuation and
        // never pushes.
        act(() => { onCommit(postUndoEdit); });

        expect(screen.getByRole('button', { name: 'lighting.layoutPresets.undo' })).not.toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'lighting.layoutPresets.undo' }));
        expect(mockApplyConfig).toHaveBeenCalledWith(postUndoEdit);
      });

      it('closes an open burst on a tab switch so an edit on the other tab (e.g. DeckDefaultTitleSettings on Settings) gets its own entry', async () => {
        mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
        mockUseDeckPresets.mockReturnValue(deckPresetsReturn({ available: true, presets: [{ id: 'p1', name: 'A' }], activeId: 'p1', presetCount: 1 }));
        await renderPage();

        const first: DeckConfig = { pages: [{ slots: [{ label: 'customize-edit' }] }] };
        const second: DeckConfig = { pages: [{ slots: [{ label: 'settings-edit' }] }] };
        const onCommit = latestOnCommit();

        act(() => { onCommit(first); });
        switchToSettingsTab();
        // Still inside what would have been the open burst's window.
        act(() => { onCommit(second); });
        fireEvent.click(screen.getByRole('tab', { name: 'devices.streamdeck.tab.customize' }));

        fireEvent.click(screen.getByRole('button', { name: 'lighting.layoutPresets.undo' }));
        expect(mockApplyConfig).toHaveBeenCalledWith(second);
        expect(screen.getByRole('button', { name: 'lighting.layoutPresets.undo' })).not.toBeDisabled();

        mockApplyConfig.mockClear();
        fireEvent.click(screen.getByRole('button', { name: 'lighting.layoutPresets.undo' }));
        expect(mockApplyConfig).toHaveBeenCalledWith(first);
        expect(screen.getByRole('button', { name: 'lighting.layoutPresets.undo' })).toBeDisabled();
      });
    });
  });

  describe('Second-click page navigation (mirrors folder double-click-enter)', () => {
    function pageChip(n: number) {
      return screen.getByRole('button', { name: `panel.settings.deck.page.tab:{"n":${n}}` });
    }

    it('a first click on an unselected page-nav key only selects it, without navigating', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      mockUsePhysicalDeckTarget.mockReturnValue({
        target: fakeTargetWithPages([
          { slots: [{}, {}, { action: { type: 'page', op: 'next' } }] },
          { slots: [] },
        ]),
        loaded: true, error: false, retry: vi.fn(),
      });
      const { container } = await renderPage();

      fireEvent.click(container.querySelectorAll('[data-deck-slot-index]')[2]);

      expect(screen.getByTestId('deck-key-inspector-editor').textContent).toBe('2');
      expect(pageChip(1)).toHaveAttribute('aria-pressed', 'true');
      expect(mockSetStreamDeckNav).not.toHaveBeenCalled();
    });

    it('a second click on the already-selected next key navigates to the next page and resets selection to 0', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      mockUsePhysicalDeckTarget.mockReturnValue({
        target: fakeTargetWithPages([
          { slots: [{}, {}, { action: { type: 'page', op: 'next' } }] },
          { slots: [] },
        ]),
        loaded: true, error: false, retry: vi.fn(),
      });
      const { container } = await renderPage();
      const cell = container.querySelectorAll('[data-deck-slot-index]')[2];

      fireEvent.click(cell);
      fireEvent.click(cell);

      expect(pageChip(2)).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('deck-key-inspector-editor').textContent).toBe('0');
      expect(mockSetStreamDeckNav).toHaveBeenCalledWith('SN1', 1, []);
    });

    it('a second click on an already-selected goto key jumps straight to its target page', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      mockUsePhysicalDeckTarget.mockReturnValue({
        target: fakeTargetWithPages([
          { slots: [{ action: { type: 'page', op: 'goto', target: 2 } }] },
          { slots: [] },
          { slots: [] },
        ]),
        loaded: true, error: false, retry: vi.fn(),
      });
      const { container } = await renderPage();
      const cell = container.querySelectorAll('[data-deck-slot-index]')[0];

      fireEvent.click(cell);
      fireEvent.click(cell);

      expect(pageChip(3)).toHaveAttribute('aria-pressed', 'true');
      expect(mockSetStreamDeckNav).toHaveBeenCalledWith('SN1', 2, []);
    });

    it('clamps at the first page instead of going negative, matching the physical deck\'s clamp (prev at page 0)', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      mockUsePhysicalDeckTarget.mockReturnValue({
        target: fakeTargetWithPages([
          { slots: [{ action: { type: 'page', op: 'prev' } }] },
          { slots: [] },
        ]),
        loaded: true, error: false, retry: vi.fn(),
      });
      const { container } = await renderPage();
      const cell = container.querySelectorAll('[data-deck-slot-index]')[0];

      fireEvent.click(cell);
      fireEvent.click(cell);

      expect(pageChip(1)).toHaveAttribute('aria-pressed', 'true');
      expect(mockSetStreamDeckNav).toHaveBeenCalledWith('SN1', 0, []);
    });

    it('clamps at the last page instead of overshooting, matching the physical deck\'s clamp (next on a single-page deck)', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      mockUsePhysicalDeckTarget.mockReturnValue({
        target: fakeTargetWithPages([{ slots: [{ action: { type: 'page', op: 'next' } }] }]),
        loaded: true, error: false, retry: vi.fn(),
      });
      const { container } = await renderPage();
      const cell = container.querySelectorAll('[data-deck-slot-index]')[0];

      fireEvent.click(cell);
      fireEvent.click(cell);

      expect(pageChip(1)).toHaveAttribute('aria-pressed', 'true');
      expect(screen.queryAllByRole('button', { name: /panel.settings.deck.page.tab/ })).toHaveLength(1);
      expect(mockSetStreamDeckNav).toHaveBeenCalledWith('SN1', 0, []);
    });
  });

  describe('Initial view seeded from the deck summary (currentPage/folderPath)', () => {
    function pageChip(n: number) {
      return screen.getByRole('button', { name: `panel.settings.deck.page.tab:{"n":${n}}` });
    }

    it('opens at the summarys currentPage when present', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck({ currentPage: 2 })]));
      mockUsePhysicalDeckTarget.mockReturnValue({
        target: fakeTargetWithPages([{ slots: [] }, { slots: [] }, { slots: [] }]),
        loaded: true, error: false, retry: vi.fn(),
      });
      await renderPage();

      expect(pageChip(3)).toHaveAttribute('aria-pressed', 'true');
    });

    it('opens inside the summarys folderPath when present', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck({ folderPath: [0] })]));
      mockUsePhysicalDeckTarget.mockReturnValue({
        target: fakeTargetWithPages([{ slots: [{ folder: { slots: [] } }] }]),
        loaded: true, error: false, retry: vi.fn(),
      });
      await renderPage();

      expect(screen.getByRole('button', { name: 'panel.settings.deck.back' })).toBeInTheDocument();
    });

    it('falls back to page 1, root folder when the summary predates these fields (older service build)', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      mockUsePhysicalDeckTarget.mockReturnValue({
        target: fakeTargetWithPages([{ slots: [] }, { slots: [] }]),
        loaded: true, error: false, retry: vi.fn(),
      });
      await renderPage();

      expect(pageChip(1)).toHaveAttribute('aria-pressed', 'true');
      expect(screen.queryByRole('button', { name: 'panel.settings.deck.back' })).toBeNull();
    });

    it('a later nav frame from the hardware still wins over the seeded view', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck({ currentPage: 0 })]));
      mockUsePhysicalDeckTarget.mockReturnValue({
        target: fakeTargetWithPages([{ slots: [] }, { slots: [] }, { slots: [] }]),
        loaded: true, error: false, retry: vi.fn(),
      });
      await renderPage();
      expect(pageChip(1)).toHaveAttribute('aria-pressed', 'true');

      act(() => { capturedNavCallback?.({ kind: 'nav', serial: 'SN1', page: 2, folderPath: [] }); });

      expect(pageChip(3)).toHaveAttribute('aria-pressed', 'true');
    });
  });
});
