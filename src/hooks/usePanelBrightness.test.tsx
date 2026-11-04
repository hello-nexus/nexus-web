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
});
