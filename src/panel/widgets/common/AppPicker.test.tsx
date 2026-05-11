import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppIcon } from './AppPicker';

vi.mock('../../../api/service', () => ({
  fetchService: vi.fn(),
  fetchServiceBlob: vi.fn(),
}));

import { fetchServiceBlob } from '../../../api/service';

describe('useAppIcon', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('returns null when no appId provided', () => {
    const { result } = renderHook(() => useAppIcon(undefined));
    expect(result.current).toBeNull();
  });

  it('fetches icon blob and returns object URL', async () => {
    const mockBlob = new Blob(['png-data'], { type: 'image/png' });
    vi.mocked(fetchServiceBlob).mockResolvedValue(mockBlob);

    const { result } = renderHook(() => useAppIcon('com.spotify.client'));

    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    expect(fetchServiceBlob).toHaveBeenCalledWith(
      '/shortcuts/icon?targetId=com.spotify.client'
    );
    expect(result.current).toBe('blob:mock-url');
  });

  it('returns null when blob fetch fails', async () => {
    vi.mocked(fetchServiceBlob).mockResolvedValue(null);

    const { result } = renderHook(() => useAppIcon('missing-app'));

    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    expect(result.current).toBeNull();
  });

  it('returns null when blob is empty', async () => {
    const emptyBlob = new Blob([], { type: 'image/png' });
    vi.mocked(fetchServiceBlob).mockResolvedValue(emptyBlob);

    const { result } = renderHook(() => useAppIcon('empty-icon'));

    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    expect(result.current).toBeNull();
  });

  it('revokes old URL when appId changes', async () => {
    const mockBlob = new Blob(['png'], { type: 'image/png' });
    vi.mocked(fetchServiceBlob).mockResolvedValue(mockBlob);

    const { rerender } = renderHook(
      ({ id }) => useAppIcon(id),
      { initialProps: { id: 'app-1' as string | undefined } }
    );

    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    rerender({ id: 'app-2' });

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('encodes special characters in targetId', async () => {
    vi.mocked(fetchServiceBlob).mockResolvedValue(null);

    renderHook(() => useAppIcon('app with spaces!'));

    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    expect(fetchServiceBlob).toHaveBeenCalledWith(
      '/shortcuts/icon?targetId=app%20with%20spaces!'
    );
  });
});
