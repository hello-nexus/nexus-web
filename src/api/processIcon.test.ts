import { describe, expect, it, vi } from 'vitest';

vi.mock('./service', () => ({ fetchServiceBlob: vi.fn() }));

import { fetchServiceBlob } from './service';
import { fetchProcessIcon } from './processIcon';

describe('fetchProcessIcon', () => {
  it('requests the process-icon route keyed by name', async () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    vi.mocked(fetchServiceBlob).mockResolvedValue(blob);

    const result = await fetchProcessIcon('chrome.exe');

    expect(fetchServiceBlob).toHaveBeenCalledWith('/monitoring/process-icon?name=chrome.exe');
    expect(result).toBe(blob);
  });

  it('encodes special characters in the process name', async () => {
    vi.mocked(fetchServiceBlob).mockResolvedValue(null);

    await fetchProcessIcon('My App (x64).exe');

    expect(fetchServiceBlob).toHaveBeenCalledWith('/monitoring/process-icon?name=My%20App%20(x64).exe');
  });

  it('returns null when the blob fetch fails (404 or network error)', async () => {
    vi.mocked(fetchServiceBlob).mockResolvedValue(null);
    expect(await fetchProcessIcon('unknown.exe')).toBeNull();
  });
});
