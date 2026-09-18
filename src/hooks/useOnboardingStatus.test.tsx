import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOnboardingStatus } from './useOnboardingStatus';
import { fetchOnboardingStatus } from '../api/onboarding';

vi.mock('../api/onboarding', () => ({
  fetchOnboardingStatus: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useOnboardingStatus', () => {
  it('reports every gate pending on a fresh install', async () => {
    vi.mocked(fetchOnboardingStatus).mockResolvedValue({ completed: false, lightingCompleted: false, featuresCompleted: false });
    const { result } = renderHook(() => useOnboardingStatus());

    expect(result.current).toMatchObject({ status: 'unknown', lightingStatus: 'unknown', featuresStatus: 'unknown' });
    await waitFor(() => expect(result.current).toMatchObject({ status: 'pending', lightingStatus: 'pending', featuresStatus: 'pending' }));
  });

  it('reports every gate completed once each flag is set', async () => {
    vi.mocked(fetchOnboardingStatus).mockResolvedValue({ completed: true, lightingCompleted: true, featuresCompleted: true });
    const { result } = renderHook(() => useOnboardingStatus());

    await waitFor(() => expect(result.current).toMatchObject({ status: 'completed', lightingStatus: 'completed', featuresStatus: 'completed' }));
  });

  // A factory reset restarts the service and puts every flag back to pending
  // under the same open page; a mount-only read would keep reporting completed.
  it('re-reads when the reload key changes, and reports the new answer', async () => {
    vi.mocked(fetchOnboardingStatus).mockResolvedValue({ completed: true, lightingCompleted: true, featuresCompleted: true });
    const { result, rerender } = renderHook(({ key }: { key: number }) => useOnboardingStatus(key), {
      initialProps: { key: 1 },
    });
    await waitFor(() => expect(result.current.status).toBe('completed'));
    const first = result.current.generation;

    vi.mocked(fetchOnboardingStatus).mockResolvedValue({ completed: false, lightingCompleted: false, featuresCompleted: false });
    rerender({ key: 2 });

    await waitFor(() => expect(result.current.status).toBe('pending'));
    expect(result.current.generation).toBeGreaterThan(first);
  });

  // The caller clears its per-session dismissal latches on a fresh read, so it
  // has to be able to tell an answer issued before that latch from one after.
  it('reports when the answering read was issued', async () => {
    vi.mocked(fetchOnboardingStatus).mockResolvedValue({ completed: false, lightingCompleted: false, featuresCompleted: false });
    const before = Date.now();
    const { result } = renderHook(() => useOnboardingStatus());

    await waitFor(() => expect(result.current.status).toBe('pending'));
    expect(result.current.readAt).toBeGreaterThanOrEqual(before);
  });

  it('fails open to completed for the lighting and features gates when the fields are absent (older service)', async () => {
    vi.mocked(fetchOnboardingStatus).mockResolvedValue({ completed: false });
    const { result } = renderHook(() => useOnboardingStatus());

    await waitFor(() => expect(result.current).toMatchObject({ status: 'pending', lightingStatus: 'completed', featuresStatus: 'completed' }));
  });
});
