// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('./service', () => ({ fetchServiceBlob: vi.fn() }));

import { fetchServiceBlob } from './service';
import { fetchSiteIcon, siteIconPath } from './siteIcon';

describe('fetchSiteIcon', () => {
  it('requests the site-icon route with the url encoded as a query value', async () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    vi.mocked(fetchServiceBlob).mockResolvedValue(blob);

    const result = await fetchSiteIcon('https://example.com/a?b=1&c=2');

    expect(fetchServiceBlob).toHaveBeenCalledWith(
      '/deck/site-icon?url=https%3A%2F%2Fexample.com%2Fa%3Fb%3D1%26c%3D2',
    );
    expect(result).toBe(blob);
  });

  it('returns null when the site serves no usable icon', async () => {
    vi.mocked(fetchServiceBlob).mockResolvedValue(null);
    expect(await fetchSiteIcon('https://example.com')).toBeNull();
  });

  it('builds a stable path so the browser cache keys on the url', () => {
    expect(siteIconPath('https://example.com')).toBe(siteIconPath('https://example.com'));
  });
});
