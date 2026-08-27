// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { killMonitoringProcess, openMonitoringProcessLocation } from './monitoringProcessActions';
import { postService } from './service';

vi.mock('./service', () => ({
  postService: vi.fn(),
}));

const mockPost = vi.mocked(postService);

describe('killMonitoringProcess', () => {
  it('posts the process name to /monitoring/process-kill', async () => {
    mockPost.mockResolvedValue({ error: false, msg: 'ok' });
    const result = await killMonitoringProcess('chrome.exe');
    expect(mockPost).toHaveBeenCalledWith('/monitoring/process-kill', { name: 'chrome.exe' });
    expect(result).toEqual({ error: false, msg: 'ok' });
  });
});

describe('openMonitoringProcessLocation', () => {
  it('posts the process name to /monitoring/process-open-location', async () => {
    mockPost.mockResolvedValue({ error: false, msg: 'ok' });
    const result = await openMonitoringProcessLocation('chrome.exe');
    expect(mockPost).toHaveBeenCalledWith('/monitoring/process-open-location', { name: 'chrome.exe' });
    expect(result).toEqual({ error: false, msg: 'ok' });
  });
});
