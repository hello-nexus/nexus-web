import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/panel', () => ({
  fetchPanelDeviceWithStatus: vi.fn(),
  patchPanelDevice: vi.fn(async () => ({})),
}));
vi.mock('../api/displays', () => ({
  fetchDisplayBrightness: vi.fn(),
  setDisplayBrightness: vi.fn(),
}));
vi.mock('../api/service', () => ({
  fetchService: vi.fn(async () => null),
  postService: vi.fn(async () => ({})),
}));

import { fetchPanelDeviceWithStatus, patchPanelDevice } from '../api/panel';
import { postService } from '../api/service';
import { fetchDisplayBrightness, setDisplayBrightness } from '../api/displays';
import { brightnessTargetFor, usePanelBrightness } from './usePanelBrightness';

describe('brightnessTargetFor', () => {
  it('keeps the Y70 on its own path', () => {
    expect(brightnessTargetFor('y70', 'd1', 'rec1')).toEqual({ kind: 'y70' });
  });

  it('prefers the panel own backlight over a bound display', () => {
    expect(brightnessTargetFor('lcd-wide', 'd1', 'rec1')).toEqual({ kind: 'record', recordId: 'rec1' });
  });

  it('falls back to the display, then nothing', () => {
    expect(brightnessTargetFor('monitor', 'd1')).toEqual({ kind: 'display', displayId: 'd1' });
    expect(brightnessTargetFor('lcd-wide', undefined)).toBeNull();
  });
});

describe('usePanelBrightness record target', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads the record value and writes lcdBrightness, never a display', async () => {
    vi.mocked(fetchPanelDeviceWithStatus).mockResolvedValue({
      found: true,
      record: { id: 'rec1', lcdBrightness: 40 },
    } as never);
    const { result } = renderHook(() => usePanelBrightness(true, { kind: 'record', recordId: 'rec1' }));
    await waitFor(() => expect(result.current.available).toBe(true));
    expect(result.current.value).toBe(40);

    act(() => result.current.commit(65));
    await waitFor(() => expect(patchPanelDevice).toHaveBeenCalledWith('rec1', { lcdBrightness: 65 }));
    expect(result.current.value).toBe(65);
    expect(fetchDisplayBrightness).not.toHaveBeenCalled();
    expect(setDisplayBrightness).not.toHaveBeenCalled();
  });

  it('defaults to full when the record has no stored value, and hides when missing', async () => {
    vi.mocked(fetchPanelDeviceWithStatus).mockResolvedValue({ found: true, record: { id: 'rec1' } } as never);
    const first = renderHook(() => usePanelBrightness(true, { kind: 'record', recordId: 'rec1' }));
    await waitFor(() => expect(first.result.current.available).toBe(true));
    expect(first.result.current.value).toBe(100);

    vi.mocked(fetchPanelDeviceWithStatus).mockResolvedValue({ found: false, status: 404 });
    const second = renderHook(() => usePanelBrightness(true, { kind: 'record', recordId: 'rec2' }));
    await waitFor(() => expect(fetchPanelDeviceWithStatus).toHaveBeenCalledWith('rec2'));
    await act(async () => {});
    expect(second.result.current.available).toBe(false);
  });

  it('previews during a drag without writing the record, then persists on release', async () => {
    vi.mocked(fetchPanelDeviceWithStatus).mockResolvedValue({ found: true, record: { id: 'rec1', lcdBrightness: 40 } } as never);
    const { result } = renderHook(() => usePanelBrightness(true, { kind: 'record', recordId: 'rec1' }));
    await waitFor(() => expect(result.current.available).toBe(true));

    act(() => result.current.preview(55));
    await waitFor(() => expect(postService).toHaveBeenCalledWith('/panel/devices/rec1/backlight-preview', { lcdBrightness: 55 }));
    expect(patchPanelDevice).not.toHaveBeenCalled();

    act(() => result.current.commit(70));
    await waitFor(() => expect(patchPanelDevice).toHaveBeenCalledWith('rec1', { lcdBrightness: 70 }));
  });

  it('persists the last previewed level when unmounted mid-drag', async () => {
    vi.mocked(fetchPanelDeviceWithStatus).mockResolvedValue({ found: true, record: { id: 'rec1', lcdBrightness: 40 } } as never);
    const { result, unmount } = renderHook(() => usePanelBrightness(true, { kind: 'record', recordId: 'rec1' }));
    await waitFor(() => expect(result.current.available).toBe(true));

    act(() => result.current.preview(25));
    unmount();

    await waitFor(() => expect(patchPanelDevice).toHaveBeenCalledWith('rec1', { lcdBrightness: 25 }));
  });

  it('queues the unmount persist behind a preview still in flight', async () => {
    vi.mocked(fetchPanelDeviceWithStatus).mockResolvedValue({ found: true, record: { id: 'rec1', lcdBrightness: 40 } } as never);
    let release: () => void = () => {};
    vi.mocked(postService).mockImplementationOnce(() => new Promise(resolve => { release = () => resolve({}); }));
    const { result, unmount } = renderHook(() => usePanelBrightness(true, { kind: 'record', recordId: 'rec1' }));
    await waitFor(() => expect(result.current.available).toBe(true));

    act(() => result.current.preview(30));
    await waitFor(() => expect(postService).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => {});
    expect(patchPanelDevice).not.toHaveBeenCalled();

    release();
    await waitFor(() => expect(patchPanelDevice).toHaveBeenCalledWith('rec1', { lcdBrightness: 30 }));
  });

  it('persists a value queued behind an in-flight preview exactly once, last', async () => {
    vi.mocked(fetchPanelDeviceWithStatus).mockResolvedValue({ found: true, record: { id: 'rec1', lcdBrightness: 40 } } as never);
    let release: () => void = () => {};
    vi.mocked(postService).mockImplementationOnce(() => new Promise(resolve => { release = () => resolve({}); }));
    const { result, unmount } = renderHook(() => usePanelBrightness(true, { kind: 'record', recordId: 'rec1' }));
    await waitFor(() => expect(result.current.available).toBe(true));

    act(() => result.current.preview(30));
    await waitFor(() => expect(postService).toHaveBeenCalledTimes(1));
    act(() => result.current.preview(45));
    unmount();
    await act(async () => {});
    expect(patchPanelDevice).not.toHaveBeenCalled();

    release();
    await waitFor(() => expect(patchPanelDevice).toHaveBeenCalledTimes(1));
    expect(patchPanelDevice).toHaveBeenCalledWith('rec1', { lcdBrightness: 45 });
    expect(postService).toHaveBeenCalledTimes(1);
  });

  it('does not persist again on unmount after a committed value landed', async () => {
    vi.mocked(fetchPanelDeviceWithStatus).mockResolvedValue({ found: true, record: { id: 'rec1', lcdBrightness: 40 } } as never);
    const { result, unmount } = renderHook(() => usePanelBrightness(true, { kind: 'record', recordId: 'rec1' }));
    await waitFor(() => expect(result.current.available).toBe(true));

    act(() => result.current.commit(70));
    await waitFor(() => expect(patchPanelDevice).toHaveBeenCalledTimes(1));
    await act(async () => {});
    unmount();
    await act(async () => {});

    expect(patchPanelDevice).toHaveBeenCalledTimes(1);
  });

  it('refreshes a held preview until release', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(fetchPanelDeviceWithStatus).mockResolvedValue({ found: true, record: { id: 'rec1', lcdBrightness: 40 } } as never);
      const { result } = renderHook(() => usePanelBrightness(true, { kind: 'record', recordId: 'rec1' }));
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });

      act(() => result.current.preview(50));
      await act(async () => { await vi.advanceTimersByTimeAsync(200); });
      const afterDrag = vi.mocked(postService).mock.calls.length;
      expect(afterDrag).toBe(1);

      await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
      expect(vi.mocked(postService).mock.calls.length).toBeGreaterThan(afterDrag);

      act(() => result.current.commit(50));
      await act(async () => { await vi.advanceTimersByTimeAsync(200); });
      const afterRelease = vi.mocked(postService).mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
      expect(vi.mocked(postService).mock.calls.length).toBe(afterRelease);
    } finally {
      vi.useRealTimers();
    }
  });

  it('persists a mid-drag level against the old target and starts the new one clean', async () => {
    vi.mocked(fetchPanelDeviceWithStatus).mockResolvedValue({ found: true, record: { id: 'x', lcdBrightness: 40 } } as never);
    let release: () => void = () => {};
    vi.mocked(postService).mockImplementationOnce(() => new Promise(resolve => { release = () => resolve({}); }));
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => usePanelBrightness(true, { kind: 'record', recordId: id }),
      { initialProps: { id: 'a' } },
    );
    await waitFor(() => expect(result.current.available).toBe(true));

    act(() => result.current.preview(30));
    await waitFor(() => expect(postService).toHaveBeenCalledTimes(1));
    act(() => result.current.preview(45));
    rerender({ id: 'b' });
    await act(async () => {});
    expect(patchPanelDevice).not.toHaveBeenCalled();

    release();
    await waitFor(() => expect(patchPanelDevice).toHaveBeenCalledWith('a', { lcdBrightness: 45 }));
    expect(patchPanelDevice).not.toHaveBeenCalledWith('b', expect.anything());
    expect(postService).toHaveBeenCalledTimes(1);

    act(() => result.current.commit(60));
    await waitFor(() => expect(patchPanelDevice).toHaveBeenCalledWith('b', { lcdBrightness: 60 }));
  });
});
