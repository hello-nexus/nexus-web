import { describe, expect, it } from 'vitest';
import { getSafeEmbedUrl } from './IFrameWidget';

describe('getSafeEmbedUrl', () => {
  it('allows http and https embeds', () => {
    expect(getSafeEmbedUrl('https://example.com/path')).toBe('https://example.com/path');
    expect(getSafeEmbedUrl('http://localhost:3000/')).toBe('http://localhost:3000/');
  });

  it('blocks non-web schemes and invalid URLs', () => {
    expect(getSafeEmbedUrl('javascript:alert(1)')).toBeNull();
    expect(getSafeEmbedUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(getSafeEmbedUrl('/relative/path')).toBeNull();
    expect(getSafeEmbedUrl('')).toBeNull();
  });
});
