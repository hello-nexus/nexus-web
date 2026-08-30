import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FpsSignatureParams, FpsSignatureResponse, FpsTableResponse } from '../types/fps-estimates';
import type { SystemSpecs } from './useSystemSpecs';

const getFpsSignatureMock = vi.fn<(params: FpsSignatureParams) => Promise<FpsSignatureResponse | null>>();
const getFpsTableMock = vi.fn<(sigKey: string) => Promise<FpsTableResponse | null>>();
vi.mock('../api/nexusApi', () => ({
  getFpsSignature: (params: FpsSignatureParams) => getFpsSignatureMock(params),
  getFpsTable: (sigKey: string) => getFpsTableMock(sigKey),
}));

let specsResult: SystemSpecs | null = null;
vi.mock('./useSystemSpecs', () => ({
  useSystemSpecs: () => ({ specs: specsResult }),
}));

function specs(overrides: Partial<SystemSpecs> = {}): SystemSpecs {
  return {
    pcName: 'Nexus-PC', osBuild: '26100', processor: 'Ryzen 9 9950X3D', motherboard: 'X670E',
    memory: '32 GB', storage: '2 TB NVMe', graphicsCard: 'RTX 5080', monitor: '2560x1440 @ 165Hz',
    soundCard: 'Realtek', networkCard: 'Intel',
    ...overrides,
  };
}

function signature(overrides: Partial<FpsSignatureResponse['resolved']> = {}): FpsSignatureResponse {
  return {
    sigKey: 'sig-1',
    resolved: {
      gpu: 'RTX 5080', cpu: 'Ryzen 9 9950X3D', mobo: 'X670E', ramTier: 32,
      resClass: '2560x1440', hz: 165, levels: [3],
      ...overrides,
    },
  };
}

function game(overrides: Partial<FpsTableResponse['games'][number]> = {}): FpsTableResponse['games'][number] {
  return {
    gameKey: 'steam:730', title: 'Counter-Strike 2', steamAppId: 730, level: 3,
    avg: 220, p1: 140, p50: 218, p99: 260, min: 90, max: 300, sessions: 40, installs: 12,
    confidence: 'medium', lowerBound: false,
    ...overrides,
  };
}

const flush = () => act(async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
});

let mod: typeof import('./useFpsEstimates');

beforeEach(async () => {
  vi.resetModules();
  getFpsSignatureMock.mockReset();
  getFpsTableMock.mockReset();
  specsResult = null;
  mod = await import('./useFpsEstimates');
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useFpsEstimates', () => {
  it('stays loading until specs arrive, without calling the signature route', () => {
    const { result } = renderHook(() => mod.useFpsEstimates());
    expect(result.current.status).toBe('loading');
    expect(getFpsSignatureMock).not.toHaveBeenCalled();
  });

  it('is silently unresolved when the rig has no parseable display resolution', async () => {
    specsResult = specs({ monitor: '' });
    const { result } = renderHook(() => mod.useFpsEstimates());
    await flush();

    expect(result.current.status).toBe('unresolved');
    expect(result.current.games).toEqual([]);
    expect(getFpsSignatureMock).not.toHaveBeenCalled();
  });

  it('resolves the signature then fetches the table, keyed by gameKey', async () => {
    specsResult = specs();
    getFpsSignatureMock.mockResolvedValue(signature());
    getFpsTableMock.mockResolvedValue({ normVersion: 1, sigKey: 'sig-1', generatedAt: '2026-01-01', games: [game()] });
    const { result } = renderHook(() => mod.useFpsEstimates());
    await flush();

    expect(getFpsSignatureMock).toHaveBeenCalledWith(expect.objectContaining({ res: '2560x1440', hz: 165 }));
    expect(getFpsTableMock).toHaveBeenCalledWith('sig-1');
    expect(result.current.status).toBe('ready');
    expect(result.current.gamesByKey.get('steam:730')?.avg).toBe(220);
    expect(result.current.resClass).toBe('2560x1440');
  });

  it('is empty, not an error, when the table has no games yet', async () => {
    specsResult = specs();
    getFpsSignatureMock.mockResolvedValue(signature());
    getFpsTableMock.mockResolvedValue({ normVersion: 1, sigKey: 'sig-1', generatedAt: '2026-01-01', games: [] });
    const { result } = renderHook(() => mod.useFpsEstimates());
    await flush();

    expect(result.current.status).toBe('empty');
    expect(result.current.games).toEqual([]);
  });

  it('is silently unresolved (no table fetch) when the signature request fails', async () => {
    specsResult = specs();
    getFpsSignatureMock.mockResolvedValue(null);
    const { result } = renderHook(() => mod.useFpsEstimates());
    await flush();

    expect(result.current.status).toBe('unresolved');
    expect(getFpsTableMock).not.toHaveBeenCalled();
  });

  it('fetches only once across remounts within the same session', async () => {
    specsResult = specs();
    getFpsSignatureMock.mockResolvedValue(signature());
    getFpsTableMock.mockResolvedValue({ normVersion: 1, sigKey: 'sig-1', generatedAt: '2026-01-01', games: [game()] });
    const first = renderHook(() => mod.useFpsEstimates());
    await flush();
    first.unmount();

    const second = renderHook(() => mod.useFpsEstimates());
    await flush();

    expect(getFpsSignatureMock).toHaveBeenCalledTimes(1);
    expect(second.result.current.status).toBe('ready');
  });

  it('is unresolved, not empty, when the table request fails after a successful signature', async () => {
    specsResult = specs();
    getFpsSignatureMock.mockResolvedValue(signature());
    getFpsTableMock.mockResolvedValue(null);
    const { result } = renderHook(() => mod.useFpsEstimates());
    await flush();

    expect(result.current.status).toBe('unresolved');
    expect(result.current.games).toEqual([]);
  });

  it('shares one signature+table request across two instances mounted at once', async () => {
    specsResult = specs();
    getFpsSignatureMock.mockResolvedValue(signature());
    getFpsTableMock.mockResolvedValue({ normVersion: 1, sigKey: 'sig-1', generatedAt: '2026-01-01', games: [game()] });

    const a = renderHook(() => mod.useFpsEstimates());
    const b = renderHook(() => mod.useFpsEstimates());
    await flush();

    expect(getFpsSignatureMock).toHaveBeenCalledTimes(1);
    expect(getFpsTableMock).toHaveBeenCalledTimes(1);
    expect(a.result.current.status).toBe('ready');
    expect(b.result.current.status).toBe('ready');
  });
});
