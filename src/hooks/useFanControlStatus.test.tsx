import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFanControlStatus } from './useFanControlStatus';
import { fetchFanControlStatus } from '../api/fancontrol';

vi.mock('../api/fancontrol', () => ({ fetchFanControlStatus: vi.fn() }));

const STATUS = {
  detected: true, running: false, importAvailable: true, autostartPresent: false,
  version: '217', installLocation: 'C:\\FanControl', configs: [], pending: true, completed: false,
};

beforeEach(() => vi.clearAllMocks());

describe('useFanControlStatus', () => {
  it('opens the gate only when the service says it is pending', async () => {
    vi.mocked(fetchFanControlStatus).mockResolvedValue(STATUS);
    const { result } = renderHook(() => useFanControlStatus());
    await waitFor(() => expect(result.current.status).toBe('pending'));
    expect(result.current.payload).toEqual(STATUS);
  });

  it('settles without opening when nothing is pending', async () => {
    vi.mocked(fetchFanControlStatus).mockResolvedValue({ ...STATUS, pending: false });
    const { result } = renderHook(() => useFanControlStatus());
    await waitFor(() => expect(result.current.status).toBe('settled'));
  });

  it('settles when the service is unreachable', async () => {
    vi.mocked(fetchFanControlStatus).mockResolvedValue(null);
    const { result } = renderHook(() => useFanControlStatus());
    await waitFor(() => expect(result.current.status).toBe('settled'));
  });

  it('settles when the request throws, so the dashboard cannot hang behind it', async () => {
    vi.mocked(fetchFanControlStatus).mockRejectedValue(new Error('not json'));
    const { result } = renderHook(() => useFanControlStatus());
    await waitFor(() => expect(result.current.status).toBe('settled'));
    expect(result.current.payload).toBeNull();
  });
});
