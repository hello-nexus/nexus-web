import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const deleteService = vi.fn();
vi.mock('../api/service', () => ({
  fetchService: vi.fn(),
  postService: vi.fn(),
  deleteService: (...a: unknown[]) => deleteService(...a),
  resolveAuthWs: vi.fn(),
}));

// Interpolation-aware t() so assertions can verify the frame's fields land.
vi.mock('../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      let text = key;
      if (params) for (const [k, v] of Object.entries(params)) text += ` ${k}=${v}`;
      return text;
    },
  }),
}));

import { MappingAppliedToasts } from './MappingAppliedToasts';
import { ToastProvider } from '../components/common/Toast/Toast';
import { MultiplexContext, type MultiplexContextValue } from '../hooks/useMultiplexSocket';
import { MAPPING_APPLIED_TOPIC, type MappingAppliedFrame } from '../api/lighting';

function renderWithMultiplex() {
  const listeners = new Map<string, Set<(data: unknown) => void>>();
  const ctx = {
    subscribe: (topic: string, listener: (data: unknown) => void) => {
      if (!listeners.has(topic)) listeners.set(topic, new Set());
      listeners.get(topic)!.add(listener);
    },
    unsubscribe: (topic: string, listener: (data: unknown) => void) => {
      listeners.get(topic)?.delete(listener);
    },
    connected: true,
    transport: 'lan',
  } as unknown as MultiplexContextValue;

  const view = render(
    <MultiplexContext.Provider value={ctx}>
      <ToastProvider>
        <MappingAppliedToasts />
      </ToastProvider>
    </MultiplexContext.Provider>,
  );
  const emit = (frame: Partial<MappingAppliedFrame>) => {
    act(() => {
      for (const listener of listeners.get(MAPPING_APPLIED_TOPIC) ?? []) listener(frame);
    });
  };
  return { ...view, emit };
}

const frame: MappingAppliedFrame = {
  revision: 1,
  deviceId: 'openrgb-3',
  deviceName: 'Lighting Node CORE',
  mappingId: 'map-123',
  mappingName: 'LL120 triple ring',
  adopterCount: 1234,
};

describe('MappingAppliedToasts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    deleteService.mockReset().mockResolvedValue({ error: false, msg: 'Ok' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a toast with mapping name, device, and adopter count', () => {
    const { emit } = renderWithMultiplex();
    emit(frame);

    expect(screen.getByText('lighting.mappings.autoAppliedTitle')).toBeTruthy();
    expect(screen.getByText(
      'lighting.mappings.autoAppliedBody name=LL120 triple ring device=Lighting Node CORE count=1234',
    )).toBeTruthy();
  });

  it('outlives the default toast duration', () => {
    const { emit } = renderWithMultiplex();
    emit(frame);

    act(() => { vi.advanceTimersByTime(7000); });
    expect(screen.getByText('lighting.mappings.autoAppliedTitle')).toBeTruthy();

    act(() => { vi.advanceTimersByTime(10000); });
    expect(screen.queryByText('lighting.mappings.autoAppliedTitle')).toBeNull();
  });

  it('Undo sends the reason=undo revoke and confirms with a follow-up toast', async () => {
    const { emit } = renderWithMultiplex();
    emit(frame);

    fireEvent.click(screen.getByText('lighting.mappings.undo'));
    expect(deleteService).toHaveBeenCalledWith('/devices/lighting-devices/openrgb-3/mapping?reason=undo');

    // Flush only the revert promise chain - advancing timers would also
    // auto-dismiss the confirmation toast under test.
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('lighting.mappings.undoneTitle')).toBeTruthy();
  });

  it('ignores malformed frames', () => {
    const { emit } = renderWithMultiplex();
    emit({ revision: 2 });
    expect(screen.queryByText('lighting.mappings.autoAppliedTitle')).toBeNull();
  });

  it('falls back to the device id and drops the count clause on partial frames', () => {
    const { emit } = renderWithMultiplex();
    emit({ revision: 3, deviceId: 'openrgb-9', mappingId: 'map-9', mappingName: 'Bare frame' });

    expect(screen.getByText(
      'lighting.mappings.autoAppliedBodyNoCount name=Bare frame device=openrgb-9',
    )).toBeTruthy();
  });
});
