import { act, render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StreamDeckSummary } from '../../../api/streamdeck';
import type { DeckTarget } from '../../../panel/widgets/deck/deckTarget';
import type { UseDeckInstanceResult } from '../../../panel/widgets/deck/useDeckInstance';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../api/service', () => ({
  isLocalhostUnreachable: () => false,
  // DeckRecentAppsSection resolves excluded-chip display names from
  // GET /shortcuts; no chips are exercised in this file's Recent Apps tests.
  fetchService: () => Promise.resolve({ shortcuts: [] }),
}));
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

const mockUseDeckInstance = vi.fn();
vi.mock('../../../panel/widgets/deck/useDeckInstance', () => ({
  useDeckInstance: (...args: unknown[]) => mockUseDeckInstance(...args),
}));

// Also covers DeckRecentAppsSection's own useRecentApps() call - both files
// resolve to this same module.
const mockUseRecentApps = vi.fn();
vi.mock('../../../panel/widgets/deck/useRecentApps', () => ({
  useRecentApps: (enabled: boolean) => mockUseRecentApps(enabled),
}));

const mockSetStreamDeckNav = vi.fn();
vi.mock('../../../api/streamdeck', () => ({
  setStreamDeckNav: (serial: string, page: number, folderPath: readonly number[]) => mockSetStreamDeckNav(serial, page, folderPath),
}));

// Keyed by topic: the page subscribes to both 'streamdeck' (nav frames) and
// 'streamdeckTiles' (live key frames), so a single shared variable would have
// the second registration overwrite the first on every render.
let capturedCallbacks: Record<string, ((data: unknown) => void) | null> = {};
vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: (topic: string, enabled: boolean, cb: (data: unknown) => void) => {
    capturedCallbacks[topic] = enabled ? cb : null;
  },
}));

vi.mock('../../../panel/widgets/deck/DeckKeyInspector', () => ({
  DeckKeyInspector: ({ selectedSlot, part, onDeleteSlot }: { selectedSlot?: number; part?: string; onDeleteSlot?: () => void }) => (
    <>
      <div data-testid={`deck-key-inspector-${part ?? 'all'}`}>{selectedSlot}</div>
      {onDeleteSlot && <button type="button" onClick={onDeleteSlot}>editor-delete</button>}
    </>
  ),
  DeckDefaultTitleSettings: () => <div data-testid="deck-default-title" />,
  slotForPickerKind: (_kind: string, base: object = {}) => base,
}));

vi.mock('./ElgatoImportModal', () => ({
  ElgatoImportModal: () => null,
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
    instanceId: 'streamdeck:SN1',
    orientation: 0,
    sleepAfterSeconds: 0,
    ...over,
  };
}

function fakeTarget(): DeckTarget {
  return {
    kind: 'physical', cols: 3, rows: 2, keyCount: 6, config: { pages: [{ slots: [] }] },
    updateSlot: vi.fn(), swapSlots: vi.fn(), addPage: vi.fn(), removePage: vi.fn(), removePageKeyCount: vi.fn(), setTitleDefault: vi.fn(),
    authoredPageCount: 1,
  };
}

function fakeTargetWithPages(pages: DeckTarget['config']['pages']): DeckTarget {
  return { ...fakeTarget(), config: { pages }, authoredPageCount: pages.length };
}

const mockRename = vi.fn();
const mockSetBrightness = vi.fn();
const mockSetOrientation = vi.fn();
const mockSetSleepAfterSeconds = vi.fn();
const mockSetSleepWhenLocked = vi.fn();
const mockRefresh = vi.fn();
const mockControlDevice = vi.fn();
const mockActivate = vi.fn();
const mockCreatePreset = vi.fn();
const mockRenamePreset = vi.fn();
const mockDeletePreset = vi.fn();
const mockSetMode = vi.fn();
const mockUndo = vi.fn();
const mockRedo = vi.fn();
const mockReset = vi.fn();
const mockEndEditBurst = vi.fn();
const mockRetry = vi.fn();

function deckInstanceReturn(over: Partial<UseDeckInstanceResult & { presets: Array<{ id: string; name: string }> }> = {}): UseDeckInstanceResult {
  return {
    instance: { mode: 'custom', activePresetId: 'p1' },
    preset: { id: 'p1', name: 'A', cols: 3, rows: 2, pageCount: 1, deck: { pages: [{ slots: [] }] } },
    presets: [],
    target: fakeTarget(),
    loaded: true,
    error: false,
    retry: mockRetry,
    setMode: mockSetMode,
    activate: mockActivate,
    createPreset: mockCreatePreset,
    renamePreset: mockRenamePreset,
    deletePreset: mockDeletePreset,
    canUndo: false,
    canRedo: false,
    undo: mockUndo,
    redo: mockRedo,
    reset: mockReset,
    endEditBurst: mockEndEditBurst,
    ...over,
  } as UseDeckInstanceResult;
}

function decksReturn(decks: StreamDeckSummary[], loaded = true) {
  return {
    decks, loaded, rename: mockRename, setBrightness: mockSetBrightness,
    setOrientation: mockSetOrientation, setSleepAfterSeconds: mockSetSleepAfterSeconds,
    setSleepWhenLocked: mockSetSleepWhenLocked,
    refresh: mockRefresh,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedCallbacks = {};
  h.conflicts = [];
  mockRename.mockResolvedValue(true);
  mockSetBrightness.mockResolvedValue(true);
  mockSetOrientation.mockResolvedValue(true);
  mockSetSleepAfterSeconds.mockResolvedValue(true);
  mockSetSleepWhenLocked.mockResolvedValue(true);
  mockControlDevice.mockResolvedValue(undefined);
  mockSetStreamDeckNav.mockResolvedValue(true);
  mockActivate.mockResolvedValue(undefined);
  mockCreatePreset.mockResolvedValue({ error: false });
  mockUseDeckInstance.mockReturnValue(deckInstanceReturn());
  mockUseRecentApps.mockReturnValue({
    apps: [], focusedProcessKey: undefined, excluded: [], loaded: true,
    setExcluded: vi.fn(), clear: vi.fn(), activate: vi.fn(),
  });
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
    expect(screen.getByText('conflicts.modal.pid:{"pid":99}')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'conflicts.modal.endTask' })).toBeInTheDocument();
  });

  it('does not render an experimental chip, even for an unverified model', async () => {
    mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck({ verified: false })]));
    await renderPage();
    expect(screen.queryByText('devices.streamdeck.experimental')).toBeNull();
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
      makeDeck({ serial: 'SN1', name: 'Deck One' }), makeDeck({ serial: 'SN2', name: 'Deck Two', instanceId: 'streamdeck:SN2' }),
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

  it('shows a load-failed message with retry instead of the inspector when the instance fetch errored', async () => {
    mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
    mockUseDeckInstance.mockReturnValue(deckInstanceReturn({ target: null, preset: null, error: true }));
    await renderPage();

    expect(screen.getByText('panel.settings.deck.rail.loadFailed')).toBeInTheDocument();
    expect(screen.queryByTestId('deck-key-inspector-editor')).toBeNull();

    fireEvent.click(screen.getByText('panel.settings.deck.rail.retry'));
    expect(mockRetry).toHaveBeenCalledTimes(1);
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

    it('renders sleep-when-locked on and commits the flip through the setSleepWhenLocked hook', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck({ sleepWhenLocked: true })]));
      await renderPage();
      switchToSettingsTab();

      const toggle = screen.getByRole('switch', { name: 'devices.streamdeck.sleepWhenLocked' });
      expect(toggle).toBeChecked();
      fireEvent.click(toggle);

      expect(mockSetSleepWhenLocked).toHaveBeenCalledWith('SN1', false);
    });

    it('treats a summary without sleepWhenLocked (older service) as on', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      await renderPage();
      switchToSettingsTab();

      expect(screen.getByRole('switch', { name: 'devices.streamdeck.sleepWhenLocked' })).toBeChecked();
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

  describe('Right-click / edit-panel delete (the preset PUT path)', () => {
    it('right-clicking a populated key opens a Delete menu that clears the slot through target.updateSlot', async () => {
      const target = fakeTargetWithPages([{ slots: [{ action: { type: 'hotkey', keys: '' } }] }]);
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      mockUseDeckInstance.mockReturnValue(deckInstanceReturn({ target }));
      const { container } = await renderPage();

      const cell = container.querySelectorAll('[data-deck-slot-index]')[0];
      const notPrevented = fireEvent.contextMenu(cell);
      expect(notPrevented).toBe(false);
      fireEvent.click(screen.getByText('common.delete'));

      expect(target.updateSlot).toHaveBeenCalledWith(0, [], 0, {});
    });

    it('right-clicking an empty key never opens the menu (nothing to delete)', async () => {
      const target = fakeTargetWithPages([{ slots: [{}] }]);
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      mockUseDeckInstance.mockReturnValue(deckInstanceReturn({ target }));
      const { container } = await renderPage();

      fireEvent.contextMenu(container.querySelectorAll('[data-deck-slot-index]')[0]);
      expect(screen.queryByText('common.delete')).toBeNull();
      expect(target.updateSlot).not.toHaveBeenCalled();
    });

    it('right-clicking a folder key with bound content opens the delete-folder confirm instead of clearing immediately', async () => {
      const target = fakeTargetWithPages([{
        slots: [{ folder: { slots: [{ action: { type: 'hotkey', keys: '' } }] } }],
      }]);
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      mockUseDeckInstance.mockReturnValue(deckInstanceReturn({ target }));
      const { container } = await renderPage();

      fireEvent.contextMenu(container.querySelectorAll('[data-deck-slot-index]')[0]);
      fireEvent.click(screen.getByText('common.delete'));

      expect(screen.getByText('panel.settings.deck.deleteFolder.title')).toBeInTheDocument();
      expect(target.updateSlot).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'confirm.ok' }));
      expect(target.updateSlot).toHaveBeenCalledWith(0, [], 0, {});
    });

    it('the edit panel delete button clears the selected slot through the same requestDelete path as the other two entry points', async () => {
      const target = fakeTargetWithPages([{ slots: [{ action: { type: 'hotkey', keys: '' } }] }]);
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      mockUseDeckInstance.mockReturnValue(deckInstanceReturn({ target }));
      await renderPage();

      fireEvent.click(screen.getByText('editor-delete'));
      expect(target.updateSlot).toHaveBeenCalledWith(0, [], 0, {});
    });

    it('the edit panel delete button opens the delete-folder confirm for a bound folder, matching the context-menu path', async () => {
      const target = fakeTargetWithPages([{
        slots: [{ folder: { slots: [{ action: { type: 'hotkey', keys: '' } }] } }],
      }]);
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      mockUseDeckInstance.mockReturnValue(deckInstanceReturn({ target }));
      await renderPage();

      fireEvent.click(screen.getByText('editor-delete'));

      expect(screen.getByText('panel.settings.deck.deleteFolder.title')).toBeInTheDocument();
      expect(target.updateSlot).not.toHaveBeenCalled();
    });
  });

  describe('Mode chip', () => {
    it('reflects the instance\'s current mode and switching it calls setMode', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      mockUseDeckInstance.mockReturnValue(deckInstanceReturn({ instance: { mode: 'custom', activePresetId: 'p1' } }));
      await renderPage();

      const customChip = screen.getByRole('radio', { name: 'panel.settings.deck.mode.custom' });
      expect(customChip).toHaveAttribute('aria-checked', 'true');

      fireEvent.click(screen.getByRole('radio', { name: 'panel.settings.deck.mode.recentApps' }));
      expect(mockSetMode).toHaveBeenCalledWith('recentApps');
    });
  });

  describe('Presets toolbar', () => {
    it('renders top-right on the Customize tab once the instance has loaded', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      mockUseDeckInstance.mockReturnValue(deckInstanceReturn({
        instance: { mode: 'custom', activePresetId: 'p1' },
        presets: [{ id: 'p1', name: 'Streaming layout' }],
      }));
      await renderPage();

      expect(screen.getByRole('button', { name: 'panel.settings.deck.presets.placeholder' })).toBeInTheDocument();
    });

    it('is not shown on the Settings tab', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      mockUseDeckInstance.mockReturnValue(deckInstanceReturn({ presets: [{ id: 'p1', name: 'A' }] }));
      await renderPage();
      switchToSettingsTab();

      expect(screen.queryByRole('button', { name: 'panel.settings.deck.presets.placeholder' })).toBeNull();
    });

    it('shows Reset/Undo/Redo controls, disabled per canUndo/canRedo', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      mockUseDeckInstance.mockReturnValue(deckInstanceReturn({ presets: [{ id: 'p1', name: 'A' }], canUndo: false, canRedo: false }));
      await renderPage();

      expect(screen.getByRole('button', { name: 'panel.settings.deck.presets.reset' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'panel.settings.deck.presets.undo' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'panel.settings.deck.presets.redo' })).toBeDisabled();
    });

    it('enables Undo/Redo per canUndo/canRedo and clicking them calls the hook', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      mockUseDeckInstance.mockReturnValue(deckInstanceReturn({ presets: [{ id: 'p1', name: 'A' }], canUndo: true, canRedo: true }));
      await renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.presets.undo' }));
      expect(mockUndo).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.presets.redo' }));
      expect(mockRedo).toHaveBeenCalledTimes(1);
    });

    it('Reset (after confirm) calls the hook\'s reset', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      mockUseDeckInstance.mockReturnValue(deckInstanceReturn({ presets: [{ id: 'p1', name: 'A' }] }));
      await renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.presets.reset' }));
      fireEvent.click(screen.getByRole('button', { name: 'confirm.ok' }));

      expect(mockReset).toHaveBeenCalledTimes(1);
    });

    it('loading a preset from the toolbar calls activate', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      mockUseDeckInstance.mockReturnValue(deckInstanceReturn({
        instance: { mode: 'custom', activePresetId: 'p1' },
        presets: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }],
      }));
      await renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.presets.placeholder' }));
      await act(async () => {
        fireEvent.click(screen.getByRole('option', { name: 'B' }));
        await Promise.resolve();
      });

      expect(mockActivate).toHaveBeenCalledWith('p2');
    });

    it('deleting the active preset calls deletePreset', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      mockUseDeckInstance.mockReturnValue(deckInstanceReturn({
        instance: { mode: 'custom', activePresetId: 'p1' },
        presets: [{ id: 'p1', name: 'A' }],
      }));
      await renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.presets.placeholder' }));
      fireEvent.click(screen.getByRole('option', { name: 'panel.settings.deck.presets.delete' }));
      fireEvent.click(screen.getByRole('button', { name: 'confirm.ok' }));

      expect(mockDeletePreset).toHaveBeenCalledWith('p1');
    });

    it('closes an editing burst on tab switch', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      mockUseDeckInstance.mockReturnValue(deckInstanceReturn({ presets: [{ id: 'p1', name: 'A' }] }));
      await renderPage();

      switchToSettingsTab();
      expect(mockEndEditBurst).toHaveBeenCalledTimes(1);
    });
  });

  describe('Second-click page navigation (mirrors folder double-click-enter)', () => {
    function pageChip(n: number) {
      return screen.getByRole('button', { name: `panel.settings.deck.page.tab:{"n":${n}}` });
    }

    it('a first click on an unselected page-nav key only selects it, without navigating', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      mockUseDeckInstance.mockReturnValue(deckInstanceReturn({
        target: fakeTargetWithPages([
          { slots: [{}, {}, { action: { type: 'page', op: 'next' } }] },
          { slots: [] },
        ]),
      }));
      const { container } = await renderPage();

      fireEvent.click(container.querySelectorAll('[data-deck-slot-index]')[2]);

      expect(screen.getByTestId('deck-key-inspector-editor').textContent).toBe('2');
      expect(pageChip(1)).toHaveAttribute('aria-pressed', 'true');
      expect(mockSetStreamDeckNav).not.toHaveBeenCalled();
    });

    it('a second click on the already-selected next key navigates to the next page and resets selection to 0', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      mockUseDeckInstance.mockReturnValue(deckInstanceReturn({
        target: fakeTargetWithPages([
          { slots: [{}, {}, { action: { type: 'page', op: 'next' } }] },
          { slots: [] },
        ]),
      }));
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
      mockUseDeckInstance.mockReturnValue(deckInstanceReturn({
        target: fakeTargetWithPages([
          { slots: [{ action: { type: 'page', op: 'goto', target: 2 } }] },
          { slots: [] },
          { slots: [] },
        ]),
      }));
      const { container } = await renderPage();
      const cell = container.querySelectorAll('[data-deck-slot-index]')[0];

      fireEvent.click(cell);
      fireEvent.click(cell);

      expect(pageChip(3)).toHaveAttribute('aria-pressed', 'true');
      expect(mockSetStreamDeckNav).toHaveBeenCalledWith('SN1', 2, []);
    });

    it('clamps at the first page instead of going negative, matching the physical deck\'s clamp (prev at page 0)', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      mockUseDeckInstance.mockReturnValue(deckInstanceReturn({
        target: fakeTargetWithPages([
          { slots: [{ action: { type: 'page', op: 'prev' } }] },
          { slots: [] },
        ]),
      }));
      const { container } = await renderPage();
      const cell = container.querySelectorAll('[data-deck-slot-index]')[0];

      fireEvent.click(cell);
      fireEvent.click(cell);

      expect(pageChip(1)).toHaveAttribute('aria-pressed', 'true');
      expect(mockSetStreamDeckNav).toHaveBeenCalledWith('SN1', 0, []);
    });

    it('clamps at the last page instead of overshooting, matching the physical deck\'s clamp (next on a single-page deck)', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      mockUseDeckInstance.mockReturnValue(deckInstanceReturn({
        target: fakeTargetWithPages([{ slots: [{ action: { type: 'page', op: 'next' } }] }]),
      }));
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
      mockUseDeckInstance.mockReturnValue(deckInstanceReturn({
        target: fakeTargetWithPages([{ slots: [] }, { slots: [] }, { slots: [] }]),
      }));
      await renderPage();

      expect(pageChip(3)).toHaveAttribute('aria-pressed', 'true');
    });

    it('opens inside the summarys folderPath when present', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck({ folderPath: [0] })]));
      mockUseDeckInstance.mockReturnValue(deckInstanceReturn({
        target: fakeTargetWithPages([{ slots: [{ folder: { slots: [] } }] }]),
      }));
      await renderPage();

      expect(screen.getByRole('button', { name: 'panel.settings.deck.back' })).toBeInTheDocument();
    });

    it('falls back to page 1, root folder when the summary predates these fields (older service build)', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      mockUseDeckInstance.mockReturnValue(deckInstanceReturn({
        target: fakeTargetWithPages([{ slots: [] }, { slots: [] }]),
      }));
      await renderPage();

      expect(pageChip(1)).toHaveAttribute('aria-pressed', 'true');
      expect(screen.queryByRole('button', { name: 'panel.settings.deck.back' })).toBeNull();
    });

    it('a later nav frame from the hardware still wins over the seeded view', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck({ currentPage: 0 })]));
      mockUseDeckInstance.mockReturnValue(deckInstanceReturn({
        target: fakeTargetWithPages([{ slots: [] }, { slots: [] }, { slots: [] }]),
      }));
      await renderPage();
      expect(pageChip(1)).toHaveAttribute('aria-pressed', 'true');

      act(() => { capturedCallbacks.streamdeck?.({ kind: 'nav', serial: 'SN1', page: 2, folderPath: [] }); });

      expect(pageChip(3)).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('Recent Apps mode', () => {
    function ringOf(count: number) {
      return Array.from({ length: count }, (_, i) => ({ processKey: `p${i}`, name: `App ${i}`, lastFocusedUtcMs: 0 }));
    }

    it('renders one cell per deck key from the live ring, with no key inspector', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck({ cols: 3, rows: 2 })])); // keyCount 6
      mockUseDeckInstance.mockReturnValue(deckInstanceReturn({ instance: { mode: 'recentApps', activePresetId: 'p1' } }));
      mockUseRecentApps.mockReturnValue({
        apps: ringOf(4), focusedProcessKey: undefined, excluded: [], loaded: true,
        setExcluded: vi.fn(), clear: vi.fn(), activate: vi.fn(),
      });
      const { container } = await renderPage();

      expect(container.querySelectorAll('[data-deck-slot-index]')).toHaveLength(6);
      expect(screen.queryByTestId('deck-key-inspector-editor')).toBeNull();
      expect(screen.queryByTestId('deck-key-inspector-picker')).toBeNull();
    });

    it('the page strip reflects buildRecentAppsView\'s auto pagination, not the preset\'s own pages', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck({ cols: 3, rows: 2 })])); // keyCount 6
      mockUseDeckInstance.mockReturnValue(deckInstanceReturn({ instance: { mode: 'recentApps', activePresetId: 'p1' } }));
      mockUseRecentApps.mockReturnValue({
        apps: ringOf(8), focusedProcessKey: undefined, excluded: [], loaded: true,
        setExcluded: vi.fn(), clear: vi.fn(), activate: vi.fn(),
      });
      await renderPage();

      expect(screen.getByRole('button', { name: 'panel.settings.deck.page.tab:{"n":1}' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'panel.settings.deck.page.tab:{"n":2}' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'panel.settings.deck.page.tab:{"n":3}' })).toBeNull();
    });

    it('pressing the navNext placeholder key advances the visible page', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck({ cols: 3, rows: 2 })])); // keyCount 6
      mockUseDeckInstance.mockReturnValue(deckInstanceReturn({ instance: { mode: 'recentApps', activePresetId: 'p1' } }));
      mockUseRecentApps.mockReturnValue({
        apps: ringOf(8), focusedProcessKey: undefined, excluded: [], loaded: true,
        setExcluded: vi.fn(), clear: vi.fn(), activate: vi.fn(),
      });
      const { container } = await renderPage();

      // Page 1 is 5 apps + a navNext key at index 5 (keyCount 6, T-1=5).
      fireEvent.click(container.querySelectorAll('[data-deck-slot-index]')[5]);

      expect(screen.getByRole('button', { name: 'panel.settings.deck.page.tab:{"n":2}' })).toHaveAttribute('aria-pressed', 'true');
      expect(mockSetStreamDeckNav).toHaveBeenCalledWith('SN1', 1, []);
    });

    it('clicking a page chip also pushes nav so the service starts pushing tiles for it', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck({ cols: 3, rows: 2 })]));
      mockUseDeckInstance.mockReturnValue(deckInstanceReturn({ instance: { mode: 'recentApps', activePresetId: 'p1' } }));
      mockUseRecentApps.mockReturnValue({
        apps: ringOf(8), focusedProcessKey: undefined, excluded: [], loaded: true,
        setExcluded: vi.fn(), clear: vi.fn(), activate: vi.fn(),
      });
      await renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.page.tab:{"n":2}' }));
      expect(mockSetStreamDeckNav).toHaveBeenCalledWith('SN1', 1, []);
    });

    it('the page strip has no add/remove controls - pages are computed, not authored', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck({ cols: 3, rows: 2 })]));
      mockUseDeckInstance.mockReturnValue(deckInstanceReturn({ instance: { mode: 'recentApps', activePresetId: 'p1' } }));
      mockUseRecentApps.mockReturnValue({
        apps: ringOf(8), focusedProcessKey: undefined, excluded: [], loaded: true,
        setExcluded: vi.fn(), clear: vi.fn(), activate: vi.fn(),
      });
      await renderPage();

      expect(screen.queryByRole('button', { name: 'panel.settings.deck.page.add' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'panel.settings.deck.page.remove' })).toBeNull();
    });

    it('shows the Recent Apps editor section instead of the fixed/appAware placeholder', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck({ cols: 3, rows: 2 })]));
      mockUseDeckInstance.mockReturnValue(deckInstanceReturn({ instance: { mode: 'recentApps', activePresetId: 'p1' } }));
      await renderPage();

      expect(screen.getByText('panel.settings.deck.recentApps.clear')).toBeInTheDocument();
    });

    it('a navNext press on the hardware moves the visible recent page, not just the fixed-mode page', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck({ cols: 3, rows: 2 })]));
      mockUseDeckInstance.mockReturnValue(deckInstanceReturn({ instance: { mode: 'recentApps', activePresetId: 'p1' } }));
      mockUseRecentApps.mockReturnValue({
        apps: ringOf(8), focusedProcessKey: undefined, excluded: [], loaded: true,
        setExcluded: vi.fn(), clear: vi.fn(), activate: vi.fn(),
      });
      await renderPage();
      expect(screen.getByRole('button', { name: 'panel.settings.deck.page.tab:{"n":1}' })).toHaveAttribute('aria-pressed', 'true');

      act(() => { capturedCallbacks.streamdeck?.({ kind: 'nav', serial: 'SN1', page: 1, folderPath: [] }); });

      expect(screen.getByRole('button', { name: 'panel.settings.deck.page.tab:{"n":2}' })).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('live tiles clear on a mode switch', () => {
    it('a switch from Fixed to App Aware drops a stale live-tile frame instead of showing through the new mode', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      // A truly empty slot never shows a liveSrc frame (DeckGrid's own
      // stale-clear rule for a self-cleared key) - slot 0 needs real content.
      const target = fakeTargetWithPages([{ slots: [{ action: { type: 'openUrl', url: 'x' } }] }]);
      mockUseDeckInstance.mockReturnValue(deckInstanceReturn({ instance: { mode: 'custom', activePresetId: 'p1' }, target }));
      const { container, rerender } = await renderPage();

      act(() => {
        capturedCallbacks.streamdeckTiles?.({ serial: 'SN1', page: 0, slotPath: '0', mime: 'image/jpeg', data: 'stale' });
      });
      expect(container.querySelector('img[src="data:image/jpeg;base64,stale"]')).toBeInTheDocument();

      mockUseDeckInstance.mockReturnValue(deckInstanceReturn({ instance: { mode: 'appAware', activePresetId: 'p1' }, target }));
      await act(async () => {
        rerender(<StreamDeckDevicePage device={makeUnifiedDevice()} controlDevice={mockControlDevice} />);
      });

      expect(container.querySelector('img[src="data:image/jpeg;base64,stale"]')).toBeNull();
    });
  });
});
