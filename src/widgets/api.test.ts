import { describe, expect, it, vi } from 'vitest';
import { fetchService } from '../api/service';
import { listInstalledApps } from './api';

vi.mock('../api/service', () => ({ fetchService: vi.fn() }));
const mockFetch = vi.mocked(fetchService);

describe('listInstalledApps', () => {
  it('rejects when the request failed, so a failure is not read as an empty list', async () => {
    mockFetch.mockResolvedValueOnce(null);
    await expect(listInstalledApps()).rejects.toThrow();
  });

  it('returns an empty list for an OK response without apps', async () => {
    mockFetch.mockResolvedValueOnce({ error: false, msg: '' });
    expect(await listInstalledApps()).toEqual([]);
  });
});
