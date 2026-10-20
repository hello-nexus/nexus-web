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
const mockGetBoards = vi.fn();
const mockGetNollieModels = vi.fn();
const mockSimulateNollie = vi.fn();
const mockClearNollie = vi.fn();
vi.mock('../../api/nollie', async () => {
  const actual = await vi.importActual<typeof import('../../api/nollie')>('../../api/nollie');
  return {
    ...actual,
    getNollieBoards: (...a: unknown[]) => mockGetBoards(...a),
    getNollieDevModels: (...a: unknown[]) => mockGetNollieModels(...a),
    simulateNollie: (...a: unknown[]) => mockSimulateNollie(...a),
    clearSimulatedNollie: (...a: unknown[]) => mockClearNollie(...a),
  };
});

const mockUseDevices = vi.fn();
vi.mock('../../hooks/useDevices', () => ({ useDevices: () => mockUseDevices() }));

let tryxOn = false;
vi.mock('../../lib/tryxSimulation', () => ({
  isTryxSimulated: () => tryxOn,
  setTryxSimulated: (on: boolean) => { tryxOn = on; },
}));

const mockAllocate = vi.fn();
const mockDeleteRecord = vi.fn();
vi.mock('../../api/panel', () => ({
  allocatePanelDevice: (...a: unknown[]) => mockAllocate(...a),
  deletePanelDevice: (...a: unknown[]) => mockDeleteRecord(...a),
  fetchPanelDevices: vi.fn().mockResolvedValue({ devices: [] }),
  patchPanelDevice: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock('../../api/displays', () => ({
  getDevPanelVariant: vi.fn().mockResolvedValue(null),
  setDevPanelVariant: vi.fn().mockResolvedValue(null),
}));

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

import { PanelSimulatorCard } from './SimulatorsCard';
import { getConnectedSimulatedPanelIds } from '../../lib/panelSimulation';
import { isTryxSimulated } from '../../lib/tryxSimulation';

function makeDeck(over: Partial<StreamDeckSummary> = {}): StreamDeckSummary {
  return {
    serial: 'sim-0080', model: 'MK.2', displayName: 'Elgato Stream Deck MK.2', name: 'Elgato Stream Deck MK.2', connected: true, verified: false,
    rows: 3, cols: 5, keyCount: 15, keyPixels: 72, format: 'jpeg', brightness: 60,
    ...over,
  };
}

const mockRefresh = vi.fn();

function decksReturn(decks: StreamDeckSummary[]) {
  return { decks, loaded: true, rename: vi.fn(), setBrightness: vi.fn(), setOrientation: vi.fn(), setSleepAfterSeconds: vi.fn(), refresh: mockRefresh };
}

const NOLLIE_MODELS = [
  { id: '3061:4714', name: 'Nollie 32CH', channels: 32 },
  { id: '16D5:2A08', name: 'Nollie 8_OS2_1', channels: 8 },
];

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  tryxOn = false;
  mockUseDevices.mockReturnValue({ devices: [] });
  mockGetDevModels.mockResolvedValue([
    { productId: 99, name: 'Elgato Stream Deck Mini', rows: 2, cols: 3, keyCount: 6 },
    { productId: 128, name: 'Elgato Stream Deck MK.2', rows: 3, cols: 5, keyCount: 15 },
    { productId: 108, name: 'Elgato Stream Deck XL', rows: 4, cols: 8, keyCount: 32 },
  ]);
  mockSimulate.mockResolvedValue(true);
  mockClearSimulated.mockResolvedValue(true);
  mockSimInput.mockResolvedValue(true);
  mockUseStreamDecks.mockReturnValue(decksReturn([]));
  mockGetNollieModels.mockResolvedValue(NOLLIE_MODELS);
  mockGetBoards.mockResolvedValue([]);
  mockSimulateNollie.mockResolvedValue(true);
  mockClearNollie.mockResolvedValue(true);
  let n = 0;
  mockAllocate.mockImplementation(async () => ({ id: `rec-${++n}` }));
  mockDeleteRecord.mockResolvedValue({ error: false });
});

async function renderCard() {
  await act(async () => { render(<PanelSimulatorCard />); });
  // Let the model-fetch effects resolve.
  await act(async () => { await Promise.resolve(); });
}

const ADD = 'tools.panelSim.add';
const openPicker = () => fireEvent.click(screen.getByRole('button', { name: ADD }));
const option = (name: string | RegExp) => screen.getByRole('option', { name });
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A disabled row carries its reason as a second line, so its accessible name starts with the label.
const disabledOption = (label: string) => option(new RegExp(`^${escapeRe(label)}`));

describe('PanelSimulatorCard', () => {
  it('lists no simulator rows until one is added', async () => {
    await renderCard();
    expect(screen.getByText('tools.panelSim.none')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'tools.panelSim.remove' })).toBeNull();
  });

  it('offers every supported screen, Stream Deck, Nollie and Tryx under vendor headers', async () => {
    await renderCard();
    openPicker();

    for (const name of [
      'HYTE Y70 Touch 2.5K', 'NZXT Kraken Plus V2', 'Lian Li Uni Fan TL LCD Flex', 'Corsair Xeneon Edge',
      'Thermalright Wonder Vision', 'ID-Cooling FX-LCD', 'Phone Panel', 'Nollie 32CH', 'devices.tryx.simulatedName',
    ]) expect(option(name)).toBeInTheDocument();
    expect(option(/Elgato Stream Deck XL/)).toBeInTheDocument();
    for (const vendor of ['Lian Li', 'Elgato', 'Nollie', 'Tryx', 'tools.panelSim.vendorGeneric']) {
      expect(screen.getByText(vendor)).toBeInTheDocument();
    }
  });

  it('adds a panel simulator as an active row with its spec and a Remove, and gives it its own record', async () => {
    await renderCard();
    openPicker();
    await act(async () => { fireEvent.click(option('Lian Li Uni Fan TL LCD Flex')); });

    expect(getConnectedSimulatedPanelIds()).toEqual(['lianli-tl-lcd-flex']);
    expect(screen.getByText('Lian Li Uni Fan TL LCD Flex')).toBeInTheDocument();
    const spec = screen.getByText(/^tools\.panelSim\.spec:/).textContent ?? '';
    expect(JSON.parse(spec.slice(spec.indexOf(':') + 1))).toMatchObject({ surface: 'lcd-round', width: 400, height: 400, dpi: 210 });
    expect(mockAllocate).toHaveBeenCalledTimes(1);
    expect(mockAllocate.mock.calls[0][0]).toBeUndefined();
  });

  it('greys out a panel simulator that is active so it cannot be added twice', async () => {
    await renderCard();
    openPicker();
    await act(async () => { fireEvent.click(option('Corsair Xeneon Edge')); });
    openPicker();

    expect(disabledOption('Corsair Xeneon Edge')).toHaveAttribute('aria-disabled', 'true');
    expect(option('Corsair XC7 RGB Elite LCD')).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(disabledOption('Corsair Xeneon Edge'));
    expect(getConnectedSimulatedPanelIds()).toEqual(['xeneon-edge']);
    expect(mockAllocate).toHaveBeenCalledTimes(1);
  });

  it('removes a panel simulator, re-enables its option and deletes the record it created', async () => {
    await renderCard();
    openPicker();
    await act(async () => { fireEvent.click(option('HYTE Q60')); });

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'tools.panelSim.remove' })); });

    expect(getConnectedSimulatedPanelIds()).toEqual([]);
    expect(mockDeleteRecord).toHaveBeenCalledWith('rec-1');
    openPicker();
    expect(option('HYTE Q60')).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('adds Tryx once and removes it', async () => {
    await renderCard();
    openPicker();
    await act(async () => { fireEvent.click(option('devices.tryx.simulatedName')); });

    expect(isTryxSimulated()).toBe(true);
    openPicker();
    expect(disabledOption('devices.tryx.simulatedName')).toHaveAttribute('aria-disabled', 'true');

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'tools.panelSim.remove' })); });
    expect(isTryxSimulated()).toBe(false);
  });

  describe('Stream Deck', () => {
    it('simulates the chosen model and refreshes the deck list', async () => {
      await renderCard();
      openPicker();
      await act(async () => {
        fireEvent.click(option('tools.streamdeckSim.modelOption:{"name":"Elgato Stream Deck XL","count":32}'));
      });

      expect(mockSimulate).toHaveBeenCalledWith(108);
      expect(mockRefresh).toHaveBeenCalled();
    });

    it('lists the active simulated deck with Remove, clears it, and disables every deck model while one is active', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck()]));
      await renderCard();

      expect(screen.getByText('Elgato Stream Deck MK.2')).toBeInTheDocument();
      openPicker();
      expect(disabledOption('tools.streamdeckSim.modelOption:{"name":"Elgato Stream Deck XL","count":32}')).toHaveAttribute('aria-disabled', 'true');
      fireEvent.keyDown(document, { key: 'Escape' });

      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'tools.panelSim.remove' })); });
      expect(mockClearSimulated).toHaveBeenCalled();
      expect(mockRefresh).toHaveBeenCalled();
    });

    it('does not list a real, non-simulated deck as a simulator', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck({ serial: 'REAL-SERIAL-1' })]));
      await renderCard();

      expect(screen.getByText('tools.panelSim.none')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'tools.panelSim.remove' })).toBeNull();
    });

    it('labels a model that has dials with its dial count', async () => {
      mockGetDevModels.mockResolvedValue([{ productId: 132, name: 'Elgato Stream Deck Plus', rows: 2, cols: 4, keyCount: 8, encoders: 4, screen: { width: 800, height: 100, kind: 'touchStrip' }, touchKeys: 0 }]);
      await renderCard();
      openPicker();
      expect(option('tools.streamdeckSim.modelOptionDials:{"name":"Elgato Stream Deck Plus","count":8,"dials":4}')).toBeInTheDocument();
    });
  });

  describe('with Nexus Control off for the handler', () => {
    const off = (id: string) => ({ id, name: id, category: 'controller', connected: false, firmwareVersion: '', nexusControlEnabled: false });

    it('disables Stream Deck and Nollie models with the reason, so the service cannot drop the simulator on its next tick', async () => {
      mockUseDevices.mockReturnValue({ devices: [off('streamdeck'), off('nollie')] });
      await renderCard();
      openPicker();

      expect(disabledOption('tools.streamdeckSim.modelOption:{"name":"Elgato Stream Deck XL","count":32}')).toHaveAttribute('aria-disabled', 'true');
      expect(disabledOption('Nollie 32CH')).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getAllByText('tools.panelSim.controlOff').length).toBeGreaterThan(1);
      fireEvent.click(disabledOption('Nollie 32CH'));
      expect(mockSimulateNollie).not.toHaveBeenCalled();
      expect(mockSimulate).not.toHaveBeenCalled();
      expect(option('HYTE Q60')).not.toHaveAttribute('aria-disabled', 'true');
    });

    it('only the handler that is off is disabled', async () => {
      mockUseDevices.mockReturnValue({ devices: [off('nollie')] });
      await renderCard();
      openPicker();

      expect(option('tools.streamdeckSim.modelOption:{"name":"Elgato Stream Deck XL","count":32}')).not.toHaveAttribute('aria-disabled', 'true');
      expect(disabledOption('Nollie 32CH')).toHaveAttribute('aria-disabled', 'true');
    });
  });

  describe('Nollie', () => {
    it('simulates the chosen board', async () => {
      await renderCard();
      openPicker();
      await act(async () => { fireEvent.click(option('Nollie 8_OS2_1')); });

      expect(mockSimulateNollie).toHaveBeenCalledWith('16D5:2A08');
    });

    it('lists a simulated board with Remove and disables the models, but ignores a real board', async () => {
      mockGetBoards.mockResolvedValue([
        { id: 'nollie-s-AB12', serial: 'AB12', name: 'Real board' },
        { id: 'nollie-s-SIM-2A08', serial: 'SIM-2A08', name: 'Nollie 8_OS2_1' },
      ]);
      await renderCard();

      expect(screen.queryByText('Real board')).toBeNull();
      expect(screen.getByText('tools.nollieSim.label')).toBeInTheDocument();
      openPicker();
      expect(disabledOption('Nollie 32CH')).toHaveAttribute('aria-disabled', 'true');
      fireEvent.keyDown(document, { key: 'Escape' });

      mockGetBoards.mockResolvedValue([]);
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'tools.panelSim.remove' })); });
      expect(mockClearNollie).toHaveBeenCalledTimes(1);
    });
  });

  describe('dial and touch input', () => {
    const PLUS = { serial: 'sim-0084', model: 'Plus', encoders: 4, screen: { width: 800, height: 100, kind: 'touchStrip' as const } };

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

    it('presses and releases the chosen Neo touch key', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck({ serial: 'sim-009a', model: 'Neo', touchKeys: 2, encoders: 0, screen: { width: 248, height: 58, kind: 'infoScreen' } })]));
      await renderCard();
      expect(screen.queryByRole('button', { name: 'tools.streamdeckSim.input.turnLeft' })).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'tools.streamdeckSim.input.touchKeyPress' }));
      expect(mockSimInput).toHaveBeenLastCalledWith({ serial: 'sim-009a', kind: 'touchKey', index: 0, pressed: true });
      fireEvent.click(screen.getByRole('button', { name: 'tools.streamdeckSim.input.touchKey' }));
      fireEvent.click(screen.getByRole('option', { name: 'tools.streamdeckSim.input.touchKeyRight' }));
      fireEvent.click(screen.getByRole('button', { name: 'tools.streamdeckSim.input.touchKeyRelease' }));
      expect(mockSimInput).toHaveBeenLastCalledWith({ serial: 'sim-009a', kind: 'touchKey', index: 1, pressed: false });
    });

    it('a dial-only screen deck (no touch) has dial controls but no touch controls', async () => {
      mockUseStreamDecks.mockReturnValue(decksReturn([makeDeck({ serial: 'sim-2b18', encoders: 2, screen: { width: 720, height: 384, kind: 'dialScreen' } })]));
      await renderCard();
      expect(screen.getByRole('button', { name: 'tools.streamdeckSim.input.turnLeft' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'tools.streamdeckSim.input.tap' })).toBeNull();
    });
  });
});
