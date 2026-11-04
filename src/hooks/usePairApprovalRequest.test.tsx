import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let topicEnabled = false;
let onFrame: (frame: unknown) => void = () => {};
const decideMock = vi.fn();

vi.mock('./useMultiplexSocket', () => ({
  useTopicCallback: (_topic: string, enabled: boolean, cb: (frame: unknown) => void) => {
    topicEnabled = enabled;
    onFrame = cb;
  },
}));

vi.mock('../api/panel', () => ({
  decidePanelPhonePairCode: (...args: unknown[]) => decideMock(...args),
}));

import { usePairApprovalRequest } from './usePairApprovalRequest';

const request = (over: Record<string, unknown> = {}) => ({
  kind: 'request',
  requestId: 'req-1',
  sas: '654321',
  deviceLabel: 'iPad',
  remoteAddress: '10.0.0.5',
  userAgent: '',
  expiresAt: Date.now() + 60_000,
  reason: '',
  ...over,
});

beforeEach(() => { decideMock.mockReset(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('usePairApprovalRequest', () => {
  it('holds the pending request from a request frame', () => {
    const { result } = renderHook(() => usePairApprovalRequest(true));
    expect(result.current.active).toBeNull();
    act(() => onFrame(request()));
    expect(result.current.active?.sas).toBe('654321');
    expect(topicEnabled).toBe(true);
  });

  it('dismisses on a cancelled frame for that request, whatever the reason', () => {
    const { result } = renderHook(() => usePairApprovalRequest(true));
    act(() => onFrame(request()));
    act(() => onFrame({ kind: 'cancelled', requestId: 'other', reason: 'expired' }));
    expect(result.current.active).not.toBeNull();
    act(() => onFrame({ kind: 'cancelled', requestId: 'req-1', reason: 'host-denied' }));
    expect(result.current.active).toBeNull();
  });

  it('sends the decision and clears the prompt on success', async () => {
    decideMock.mockResolvedValueOnce({ status: 'approved' });
    const { result } = renderHook(() => usePairApprovalRequest(true));
    act(() => onFrame(request()));
    await act(async () => { await result.current.decide(true); });
    expect(decideMock).toHaveBeenCalledWith('req-1', true);
    expect(result.current.active).toBeNull();
  });

  it('sends a denial', async () => {
    decideMock.mockResolvedValueOnce({ status: 'denied' });
    const { result } = renderHook(() => usePairApprovalRequest(true));
    act(() => onFrame(request()));
    await act(async () => { await result.current.decide(false); });
    expect(decideMock).toHaveBeenCalledWith('req-1', false);
    expect(result.current.active).toBeNull();
  });

  it('keeps the prompt and reports an error when the decision fails', async () => {
    decideMock.mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => usePairApprovalRequest(true));
    act(() => onFrame(request()));
    await act(async () => { await result.current.decide(true); });
    expect(result.current.active).not.toBeNull();
    expect(result.current.error).toBe('phonePair.code.errorDecide');
  });

  it('expires at the request deadline', () => {
    const { result } = renderHook(() => usePairApprovalRequest(true));
    act(() => onFrame(request({ expiresAt: Date.now() + 5000 })));
    act(() => { vi.advanceTimersByTime(5001); });
    expect(result.current.active).toBeNull();
  });

  it('drops the prompt when the surface can no longer answer it', () => {
    const { result, rerender } = renderHook(({ on }) => usePairApprovalRequest(on), { initialProps: { on: true } });
    act(() => onFrame(request()));
    rerender({ on: false });
    expect(result.current.active).toBeNull();
    expect(topicEnabled).toBe(false);
  });
});
