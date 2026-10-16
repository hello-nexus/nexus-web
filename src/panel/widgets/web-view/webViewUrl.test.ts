import { describe, expect, it } from 'vitest';
import { normalizeWebViewUrl, webViewHostName } from './webViewUrl';

describe('normalizeWebViewUrl', () => {
  it('keeps http and https urls', () => {
    expect(normalizeWebViewUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(normalizeWebViewUrl('http://example.com/')).toBe('http://example.com/');
  });

  it('prefixes https for a bare host, host:port, or protocol-relative input', () => {
    expect(normalizeWebViewUrl('example.com')).toBe('https://example.com/');
    expect(normalizeWebViewUrl('  example.com/path ')).toBe('https://example.com/path');
    expect(normalizeWebViewUrl('localhost:8080')).toBe('https://localhost:8080/');
    expect(normalizeWebViewUrl('//example.com')).toBe('https://example.com/');
  });

  it.each(['javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd', 'ftp://example.com', 'mailto:a@b.c', 'blob:https://x/y'])(
    'refuses %s', raw => {
      expect(normalizeWebViewUrl(raw)).toBeNull();
    },
  );

  it('refuses empty, spaced and non-string input', () => {
    expect(normalizeWebViewUrl('')).toBeNull();
    expect(normalizeWebViewUrl('   ')).toBeNull();
    expect(normalizeWebViewUrl('not a url')).toBeNull();
    expect(normalizeWebViewUrl(undefined)).toBeNull();
    expect(normalizeWebViewUrl(5)).toBeNull();
  });
});

describe('webViewHostName', () => {
  it('returns the hostname', () => {
    expect(webViewHostName('https://sub.example.com:81/x')).toBe('sub.example.com');
  });
});

describe('snapZoom', () => {
  it('snaps to the nearest quarter within the range', async () => {
    const { snapZoom } = await import('./webViewConfig');
    expect(snapZoom(1.3)).toBe(1.25);
    expect(snapZoom(1.4)).toBe(1.5);
    expect(snapZoom(0.01)).toBe(0.25);
    expect(snapZoom(9)).toBe(3);
  });

  it('leaves an imported zoom as stored', async () => {
    const { resolveZoom } = await import('./webViewConfig');
    expect(resolveZoom(1.3)).toBe(1.3);
  });
});
