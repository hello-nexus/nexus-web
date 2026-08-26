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

    expect(result.current).toEqual({ status: 'unknown', lightingStatus: 'unknown', featuresStatus: 'unknown' });
    await waitFor(() => expect(result.current).toEqual({ status: 'pending', lightingStatus: 'pending', featuresStatus: 'pending' }));
  });

  it('reports every gate completed once each flag is set', async () => {
    vi.mocked(fetchOnboardingStatus).mockResolvedValue({ completed: true, lightingCompleted: true, featuresCompleted: true });
    const { result } = renderHook(() => useOnboardingStatus());

    await waitFor(() => expect(result.current).toEqual({ status: 'completed', lightingStatus: 'completed', featuresStatus: 'completed' }));
  });

  it('fails open to completed for the lighting and features gates when the fields are absent (older service)', async () => {
    vi.mocked(fetchOnboardingStatus).mockResolvedValue({ completed: false });
    const { result } = renderHook(() => useOnboardingStatus());

    await waitFor(() => expect(result.current).toEqual({ status: 'pending', lightingStatus: 'completed', featuresStatus: 'completed' }));
  });
});
