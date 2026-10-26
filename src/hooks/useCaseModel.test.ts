import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchLightingScene, fetchSceneModel } from '../api/lightingScene';
import { useCaseModel } from './useCaseModel';

vi.mock('../api/lightingScene', () => ({ fetchLightingScene: vi.fn(), fetchSceneModel: vi.fn() }));

describe('useCaseModel', () => {
  beforeEach(() => { vi.mocked(fetchLightingScene).mockReset(); vi.mocked(fetchSceneModel).mockReset(); });

  it('settles with no model when the scene holds none', async () => {
    vi.mocked(fetchLightingScene).mockResolvedValue({ modelRev: null } as never);
    const { result } = renderHook(() => useCaseModel(true, 1));
    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(result.current.bytes).toBeNull();
    expect(fetchSceneModel).not.toHaveBeenCalled();
  });

  it('settles with no model when the model answer is a 404', async () => {
    vi.mocked(fetchLightingScene).mockResolvedValue({ modelRev: 'a' } as never);
    vi.mocked(fetchSceneModel).mockResolvedValue(null);
    const { result } = renderHook(() => useCaseModel(true, 1));
    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(result.current.bytes).toBeNull();
  });

  it('fetches the model once per model revision and again when the revision changes', async () => {
    const first = new ArrayBuffer(4);
    const second = new ArrayBuffer(8);
    vi.mocked(fetchLightingScene).mockResolvedValue({ modelRev: 'a' } as never);
    vi.mocked(fetchSceneModel).mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const { result, rerender } = renderHook(({ rev }) => useCaseModel(true, rev), { initialProps: { rev: 1 } });
    await waitFor(() => expect(result.current.bytes).toBe(first));
    rerender({ rev: 2 });
    await waitFor(() => expect(fetchLightingScene).toHaveBeenCalledTimes(2));
    expect(fetchSceneModel).toHaveBeenCalledTimes(1);
    vi.mocked(fetchLightingScene).mockResolvedValue({ modelRev: 'b' } as never);
    rerender({ rev: 3 });
    await waitFor(() => expect(result.current.bytes).toBe(second));
    expect(fetchSceneModel).toHaveBeenCalledTimes(2);
  });
});
