import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DeviceListItem } from './useDevices';
import type { StreamDeckSummary } from '../api/streamdeck';

const mockUseDevices = vi.fn();
vi.mock('./useDevices', () => ({
  useDevices: () => mockUseDevices(),
}));

const mockUsePanelDevices = vi.fn();
vi.mock('./usePanelDevices', () => ({
  usePanelDevices: () => mockUsePanelDevices(),
}));

const mockUsePeripherals = vi.fn();
vi.mock('./usePeripherals', () => ({
  usePeripherals: () => mockUsePeripherals(),
}));

const mockUseWebHidPeripherals = vi.fn();
vi.mock('./useWebHidPeripherals', () => ({
  useWebHidPeripherals: () => mockUseWebHidPeripherals(),
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

import { useUnifiedDevices } from './useUnifiedDevices';

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
  mockUsePeripherals.mockReturnValue({ peripherals: [], loading: false, refresh: vi.fn() });
  mockUseWebHidPeripherals.mockReturnValue({ available: false, peripherals: [], refresh: vi.fn() });
  mockUseDevices.mockReturnValue({ devices: [], controlDevice: vi.fn() });
  mockUseStreamDecks.mockReturnValue({ decks: [] });
});

describe('useUnifiedDevices - Stream Deck per-deck entries', () => {
  it('emits one entry per deck instead of the singleton streamdeck handler row', () => {
    mockUseDevices.mockReturnValue({ devices: [makeHandlerRow({ connected: true })], controlDevice: vi.fn() });
    mockUseStreamDecks.mockReturnValue({
      decks: [
        makeDeck({ serial: 'SN1', model: 'Mini' }),
        makeDeck({ serial: 'SN2', model: 'XL', connected: false }),
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

  it('lists a persisted-but-unplugged deck as a disconnected entry, not omitted', () => {
    mockUseDevices.mockReturnValue({ devices: [makeHandlerRow({ connected: false })], controlDevice: vi.fn() });
    mockUseStreamDecks.mockReturnValue({ decks: [makeDeck({ serial: 'SN1', connected: false })] });

    const { result } = renderHook(() => useUnifiedDevices(true));
    const entry = result.current.unified.find(d => d.streamdeckSerial === 'SN1');

    expect(entry).toBeDefined();
    expect(entry?.connected).toBe(false);
  });

  it('emits no entries when there are no decks at all', () => {
    mockUseDevices.mockReturnValue({ devices: [makeHandlerRow({ connected: false })], controlDevice: vi.fn() });
    mockUseStreamDecks.mockReturnValue({ decks: [] });

    const { result } = renderHook(() => useUnifiedDevices(true));
    expect(result.current.unified.some(d => d.curatedId === 'streamdeck')).toBe(false);
  });
});
