import { describe, expect, it, vi } from 'vitest';
import { isLianLiHubId, lianLiHubName, lianLiHubQuery } from './lianli';

describe('wired hub ids', () => {
  it('recognises the primary and numbered hubs only', () => {
    expect(isLianLiHubId('lianli')).toBe(true);
    expect(isLianLiHubId('lianli2')).toBe(true);
    expect(isLianLiHubId('lianli4')).toBe(true);
    expect(isLianLiHubId('lianli1')).toBe(false);
    expect(isLianLiHubId('lianli5')).toBe(false);
    expect(isLianLiHubId('lianli-wireless')).toBe(false);
    expect(isLianLiHubId('lianli-tl')).toBe(false);
    expect(isLianLiHubId('lianli:port0')).toBe(false);
    expect(isLianLiHubId(undefined)).toBe(false);
  });

  it('names a hub past the first with its number', () => {
    expect(lianLiHubName('lianli')).toBe('Lian Li Uni Hub');
    expect(lianLiHubName('lianli3')).toBe('Lian Li Uni Hub 3');
  });

  it('sends a hub query for every hub but the primary', () => {
    expect(lianLiHubQuery('lianli')).toBe('');
    expect(lianLiHubQuery('lianli2')).toBe('?hub=lianli2');
  });
});

const mockPut = vi.fn();
vi.mock('./service', async importOriginal => ({
  ...(await importOriginal<typeof import('./service')>()),
  putService: (...args: unknown[]) => mockPut(...args),
}));

describe('hub composition', () => {
  it('names a second wired hub and leaves the others unqualified', async () => {
    const { setHubComposition } = await import('./lighting');
    await setHubComposition({ hubKind: 'lianli', hubId: 'lianli2' }, { combineRings: true });
    await setHubComposition({ hubKind: 'lianli', hubId: 'lianli' }, { combineRings: true });
    await setHubComposition({ hubKind: 'smarthub', hubId: 'smarthub' }, { mirror: true });
    expect(mockPut.mock.calls.map(c => c[0])).toEqual([
      '/devices/lianli/composition?hub=lianli2',
      '/devices/lianli/composition',
      '/devices/smarthub/composition',
    ]);
  });
});
