import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DeviceListItem } from './useDevices';
import type { StreamDeckSummary } from '../api/streamdeck';
import type { PanelDevice } from '../panel/device/panelDevices';

const mockUseDevices = vi.fn();
vi.mock('./useDevices', () => ({
  useDevices: () => mockUseDevices(),
}));

const mockUsePanelDevices = vi.fn();
vi.mock('./usePanelDevices', () => ({
  usePanelDevices: () => mockUsePanelDevices(),
}));

const mockUseStreamDecks = vi.fn();
vi.mock('./useStreamDecks', () => ({
  useStreamDecks: () => mockUseStreamDecks(),
}));

vi.mock('../lib/tryxSimulation', () => ({
  useTryxSimulated: () => false,
}));

vi.mock('../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));

import { useUnifiedDevices, isSimulatedDevice } from './useUnifiedDevices';

function makeHandlerRow(over: Partial<DeviceListItem> = {}): DeviceListItem {
  return {
    id: 'streamdeck',
    name: 'Stream Deck',
    category: 'controller',
    connected: false,
    firmwareVersion: '',
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
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUsePanelDevices.mockReturnValue({ devices: [], loading: false });
  mockUseDevices.mockReturnValue({ devices: [], controlDevice: vi.fn() });
  mockUseStreamDecks.mockReturnValue({ decks: [] });
});

describe('useUnifiedDevices - Stream Deck per-deck entries', () => {
  it('emits one entry per deck instead of the singleton streamdeck handler row', () => {
    mockUseDevices.mockReturnValue({ devices: [makeHandlerRow({ connected: true })], controlDevice: vi.fn() });
    mockUseStreamDecks.mockReturnValue({
      decks: [
        makeDeck({ serial: 'SN1', model: 'Mini' }),
        makeDeck({ serial: 'SN2', model: 'XL' }),
      ],
    });

    const { result } = renderHook(() => useUnifiedDevices(true));
    const streamdeckEntries = result.current.unified.filter(d => d.curatedId === 'streamdeck');

    expect(streamdeckEntries).toHaveLength(2);
    expect(streamdeckEntries.map(d => d.streamdeckSerial).sort()).toEqual(['SN1', 'SN2']);
    // The single 'streamdeck' handler row buildUnifiedList would otherwise
    // emit (curated-streamdeck) must never appear alongside the per-deck rows.
    expect(result.current.unified.some(d => d.key === 'curated-streamdeck')).toBe(false);
  });

  it('uses the generic model label for shortName and keys the entry by serial', () => {
    mockUseDevices.mockReturnValue({ devices: [makeHandlerRow({ connected: true })], controlDevice: vi.fn() });
    mockUseStreamDecks.mockReturnValue({ decks: [makeDeck({ serial: 'SN1', model: 'Mini' })] });

    const { result } = renderHook(() => useUnifiedDevices(true));
    const entry = result.current.unified.find(d => d.curatedId === 'streamdeck');

    expect(entry?.key).toBe('streamdeck:SN1');
    expect(entry?.shortName).toBe('devices.streamdeck.modelName:{"model":"Mini"}');
    expect(entry?.navigable).toBe(true);
  });

  it('names the entry after the deck\'s own persisted name, so two same-model decks stay distinguishable', () => {
    mockUseDevices.mockReturnValue({ devices: [makeHandlerRow({ connected: true })], controlDevice: vi.fn() });
    mockUseStreamDecks.mockReturnValue({
      decks: [
        makeDeck({ serial: 'SN1', model: 'Mini', name: 'Streaming Deck' }),
        makeDeck({ serial: 'SN2', model: 'Mini', name: 'Editing Deck' }),
      ],
    });

    const { result } = renderHook(() => useUnifiedDevices(true));
    const entries = result.current.unified.filter(d => d.curatedId === 'streamdeck');

    // Both share the same generic shortName (matches every other curated
    // device's sidebar row), but `name` carries each deck's own identity.
    expect(entries.every(d => d.shortName === 'devices.streamdeck.modelName:{"model":"Mini"}')).toBe(true);
    expect(entries.map(d => d.name).sort()).toEqual(['Editing Deck', 'Streaming Deck']);
  });

  it('marks a simulated deck simulated, and a real one not', () => {
    mockUseDevices.mockReturnValue({ devices: [makeHandlerRow({ connected: true })], controlDevice: vi.fn() });
    mockUseStreamDecks.mockReturnValue({
      decks: [makeDeck({ serial: 'sim-1' }), makeDeck({ serial: 'SN1' })],
    });

    const { result } = renderHook(() => useUnifiedDevices(true));
    const bySerial = (s: string) => result.current.unified.find(d => d.streamdeckSerial === s)!;

    expect(isSimulatedDevice(bySerial('sim-1'))).toBe(true);
    expect(isSimulatedDevice(bySerial('SN1'))).toBe(false);
  });

  // Turning Nexus Control off makes StreamDeckConnectionWorker.Tick call
  // DisconnectAll, so every deck reports connected=false even though the
  // hardware is still enumerated. Reporting that as disconnected dimmed the
  // deck as unplugged on every surface and stranded its device page on the
  // "not connected" empty state, with no switch to turn control back on.
  it('reports a released deck as connected while Nexus Control is off and the hardware is still enumerated', () => {
    mockUseDevices.mockReturnValue({
      devices: [makeHandlerRow({ connected: true, nexusControlEnabled: false, supportsNexusControl: true })],
      controlDevice: vi.fn(),
    });
    mockUseStreamDecks.mockReturnValue({ decks: [makeDeck({ serial: 'SN1', connected: false })] });

    const { result } = renderHook(() => useUnifiedDevices(true));

    expect(result.current.unified.find(d => d.streamdeckSerial === 'SN1')?.connected).toBe(true);
  });

  it('omits a released deck once the hardware is gone (control off, not enumerated)', () => {
    mockUseDevices.mockReturnValue({
      devices: [makeHandlerRow({ connected: false, nexusControlEnabled: false, supportsNexusControl: true })],
      controlDevice: vi.fn(),
    });
    mockUseStreamDecks.mockReturnValue({ decks: [makeDeck({ serial: 'SN1', connected: false })] });

    const { result } = renderHook(() => useUnifiedDevices(true));

    expect(result.current.unified.find(d => d.streamdeckSerial === 'SN1')).toBeUndefined();
  });

  it('keeps a present deck (own connected authoritative) and omits a non-present one while control is on', () => {
    mockUseDevices.mockReturnValue({
      devices: [makeHandlerRow({ connected: true, nexusControlEnabled: true, supportsNexusControl: true })],
      controlDevice: vi.fn(),
    });
    mockUseStreamDecks.mockReturnValue({
      decks: [makeDeck({ serial: 'SN1', connected: true }), makeDeck({ serial: 'SN2', connected: false })],
    });

    const { result } = renderHook(() => useUnifiedDevices(true));
    const bySerial = (s: string) => result.current.unified.find(d => d.streamdeckSerial === s);

    // Control on never forces connected (deckPresentWhileReleased is off), so a
    // present deck reports its own flag and a non-present one is dropped, not
    // shown as a phantom disconnected row.
    expect(bySerial('SN1')?.connected).toBe(true);
    expect(bySerial('SN2')).toBeUndefined();
  });

  it('falls back to the handler-agnostic defaults when the /devices/all handler row has not loaded yet', () => {
    mockUseDevices.mockReturnValue({ devices: [], controlDevice: vi.fn() });
    mockUseStreamDecks.mockReturnValue({ decks: [makeDeck({ serial: 'SN1' })] });

    const { result } = renderHook(() => useUnifiedDevices(true));
    const entry = result.current.unified.find(d => d.curatedId === 'streamdeck');

    expect(entry?.nexusControlEnabled).toBe(true);
    expect(entry?.supportsNexusControl).toBe(false);
    expect(entry?.category).toBe('controller');
  });

  it('mirrors the handler-level Nexus Control gate onto every deck entry', () => {
    mockUseDevices.mockReturnValue({
      devices: [makeHandlerRow({ connected: true, nexusControlEnabled: false, supportsNexusControl: true })],
      controlDevice: vi.fn(),
    });
    mockUseStreamDecks.mockReturnValue({ decks: [makeDeck({ serial: 'SN1' }), makeDeck({ serial: 'SN2' })] });

    const { result } = renderHook(() => useUnifiedDevices(true));
    const entries = result.current.unified.filter(d => d.curatedId === 'streamdeck');

    expect(entries).toHaveLength(2);
    expect(entries.every(d => d.nexusControlEnabled === false && d.supportsNexusControl === true)).toBe(true);
  });

  it('carries each deck\'s own warning/conflictAppId instead of a shared one', () => {
    mockUseDevices.mockReturnValue({ devices: [makeHandlerRow({ connected: true })], controlDevice: vi.fn() });
    mockUseStreamDecks.mockReturnValue({
      decks: [
        makeDeck({ serial: 'SN1', warning: 'elgato-software-running', conflictAppId: 'elgato-stream-deck' }),
        makeDeck({ serial: 'SN2' }),
      ],
    });

    const { result } = renderHook(() => useUnifiedDevices(true));
    const bySerial = (serial: string) => result.current.unified.find(d => d.streamdeckSerial === serial);

    expect(bySerial('SN1')?.warning).toBe('elgato-software-running');
    expect(bySerial('SN1')?.conflictAppId).toBe('elgato-stream-deck');
    expect(bySerial('SN2')?.warning).toBeUndefined();
  });

  it('omits a persisted-but-unplugged deck (control on, hardware not on the bus)', () => {
    mockUseDevices.mockReturnValue({ devices: [makeHandlerRow({ connected: false })], controlDevice: vi.fn() });
    mockUseStreamDecks.mockReturnValue({ decks: [makeDeck({ serial: 'SN1', connected: false })] });

    const { result } = renderHook(() => useUnifiedDevices(true));
    const entry = result.current.unified.find(d => d.streamdeckSerial === 'SN1');

    // The service keeps the deck's persisted record forever; it must not surface
    // as a phantom device once the hardware leaves the USB bus.
    expect(entry).toBeUndefined();
  });

  it('emits no entries when there are no decks at all', () => {
    mockUseDevices.mockReturnValue({ devices: [makeHandlerRow({ connected: false })], controlDevice: vi.fn() });
    mockUseStreamDecks.mockReturnValue({ decks: [] });

    const { result } = renderHook(() => useUnifiedDevices(true));
    expect(result.current.unified.some(d => d.curatedId === 'streamdeck')).toBe(false);
  });
});

describe('useUnifiedDevices - iBUYPOWER AW5', () => {
  function makeAw5(over: Partial<DeviceListItem> = {}): DeviceListItem {
    return makeHandlerRow({
      id: 'aw5',
      name: 'iBUYPOWER AW5',
      category: 'cooler',
      connected: true,
      // The vendor driver owns the cooler, so the service reports no control gate.
      supportsNexusControl: false,
      // ...and nothing to configure, so the handler declares no page of its own.
      hasPage: false,
      ...over,
    });
  }

  it('lists the AW5 but keeps it out of the sidebar, search, and detail routes', () => {
    mockUseDevices.mockReturnValue({ devices: [makeAw5()], controlDevice: vi.fn() });

    const { result } = renderHook(() => useUnifiedDevices(true));
    const entry = result.current.unified.find(d => d.curatedId === 'aw5');

    expect(entry).toBeDefined();
    expect(entry?.connected).toBe(true);
    // navigable gates the sidebar row, TopSearch, and the clickable card - the
    // AW5 has nothing to configure, so it stays a status row like the MiniHub.
    expect(entry?.navigable).toBe(false);
    expect(entry?.supportsNexusControl).toBe(false);
  });

  it('drops out of the list when the cooler is unplugged', () => {
    // The handler is always registered, so an unplugged AW5 arrives as a row
    // with connected:false - never an absent one. That is the gate under test.
    mockUseDevices.mockReturnValue({ devices: [makeAw5({ connected: false })], controlDevice: vi.fn() });

    const { result } = renderHook(() => useUnifiedDevices(true));
    expect(result.current.unified.some(d => d.curatedId === 'aw5')).toBe(false);
  });
});

describe('useUnifiedDevices - hasPage gates navigable', () => {
  it('follows the flag, not the device id', () => {
    // Nothing here knows which devices lack a page; the service says so per
    // device, so a new handler is linkable by what it declares.
    mockUseDevices.mockReturnValue({
      devices: [
        makeHandlerRow({ id: 'with-page', category: 'hub', connected: true, hasPage: true }),
        makeHandlerRow({ id: 'without-page', category: 'hub', connected: true, hasPage: false }),
      ],
      controlDevice: vi.fn(),
    });

    const { result } = renderHook(() => useUnifiedDevices(true));
    expect(result.current.unified.find(d => d.curatedId === 'with-page')?.navigable).toBe(true);
    expect(result.current.unified.find(d => d.curatedId === 'without-page')?.navigable).toBe(false);
  });

  it('treats an absent flag as having a page', () => {
    // An older service omits the field; every curated device had a page then.
    mockUseDevices.mockReturnValue({
      devices: [makeHandlerRow({ id: 'legacy', category: 'hub', connected: true })],
      controlDevice: vi.fn(),
    });

    const { result } = renderHook(() => useUnifiedDevices(true));
    expect(result.current.unified.find(d => d.curatedId === 'legacy')?.navigable).toBe(true);
  });
});

function makePanelDevice(over: Partial<PanelDevice> = {}): PanelDevice {
  return {
    id: 'device:y70',
    name: 'Y70 Touch',
    subtitle: '',
    status: 'online',
    statusLabel: 'Online',
    connectionKind: 'attached-monitor',
    managementMode: 'managed',
    surfaceProfileKey: 'y70-portrait',
    runtimeSurface: 'y70',
    iconSrc: '/assets/devices/y70.svg',
    capabilities: {
      layout: true, theme: true, displayControls: true, launchClose: true,
      pairing: false, presence: false, touch: true,
    },
    ...over,
  };
}

describe('useUnifiedDevices - promoted-monitor panel Nexus Link toggle', () => {
  function makeMonitorPanel(over: Partial<PanelDevice> = {}): PanelDevice {
    return makePanelDevice({
      id: 'display:rec1',
      name: 'Xeneon Edge',
      surfaceProfileKey: 'monitor-rec1',
      runtimeSurface: 'monitor',
      displayId: 'disp1',
      panelRecordId: 'rec1',
      capabilities: {
        layout: true, theme: true, displayControls: false, launchClose: false,
        pairing: false, presence: false, touch: true,
      },
      linkEnabled: true,
      ...over,
    });
  }

  it('has no first-party handler backing it, yet gets a working row toggle mirroring linkEnabled: false', () => {
    mockUsePanelDevices.mockReturnValue({ devices: [makeMonitorPanel({ linkEnabled: false })], loading: false });

    const { result } = renderHook(() => useUnifiedDevices(true));
    const entry = result.current.unified.find(d => d.key === 'panel-display:rec1');

    expect(entry).toBeDefined();
    expect(entry?.curatedId).toBeUndefined();
    expect(entry?.supportsNexusControl).toBe(true);
    expect(entry?.nexusControlEnabled).toBe(false);
    expect(entry?.experimental).toBe(false);
  });

  it('mirrors linkEnabled: true as an on toggle', () => {
    mockUsePanelDevices.mockReturnValue({ devices: [makeMonitorPanel({ linkEnabled: true })], loading: false });

    const { result } = renderHook(() => useUnifiedDevices(true));
    const entry = result.current.unified.find(d => d.key === 'panel-display:rec1');

    expect(entry?.supportsNexusControl).toBe(true);
    expect(entry?.nexusControlEnabled).toBe(true);
  });

  it('defaults nexusControlEnabled to true when linkEnabled is absent', () => {
    mockUsePanelDevices.mockReturnValue({ devices: [makeMonitorPanel({ linkEnabled: undefined })], loading: false });

    const { result } = renderHook(() => useUnifiedDevices(true));
    const entry = result.current.unified.find(d => d.key === 'panel-display:rec1');

    expect(entry?.supportsNexusControl).toBe(true);
    expect(entry?.nexusControlEnabled).toBe(true);
  });
});

describe('useUnifiedDevices - curated-backed panel entries unaffected by the promoted-monitor widening', () => {
  it('a first-party hardware panel (Y70) keeps mirroring its own handler gate, not the promoted-monitor default', () => {
    mockUseDevices.mockReturnValue({
      devices: [makeHandlerRow({
        id: 'y70', name: 'Y70 Touch', category: 'display', connected: true,
        nexusControlEnabled: false, supportsNexusControl: true, experimental: true,
      })],
      controlDevice: vi.fn(),
    });
    mockUsePanelDevices.mockReturnValue({
      devices: [makePanelDevice({ id: 'device:y70', sourceId: 'y70' })],
      loading: false,
    });

    const { result } = renderHook(() => useUnifiedDevices(true));
    const entry = result.current.unified.find(d => d.key === 'panel-device:y70');

    expect(entry?.curatedId).toBe('y70');
    expect(entry?.supportsNexusControl).toBe(true);
    expect(entry?.nexusControlEnabled).toBe(false);
    expect(entry?.experimental).toBe(true);
  });

  it('a first-party hardware panel with no backing handler row still gets no toggle (unchanged default)', () => {
    mockUseDevices.mockReturnValue({ devices: [], controlDevice: vi.fn() });
    mockUsePanelDevices.mockReturnValue({
      devices: [makePanelDevice({ id: 'device:y70', sourceId: 'y70' })],
      loading: false,
    });

    const { result } = renderHook(() => useUnifiedDevices(true));
    const entry = result.current.unified.find(d => d.key === 'panel-device:y70');

    expect(entry?.curatedId).toBe('y70');
    expect(entry?.supportsNexusControl).toBe(false);
    expect(entry?.nexusControlEnabled).toBe(true);
  });
});
