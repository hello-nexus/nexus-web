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
