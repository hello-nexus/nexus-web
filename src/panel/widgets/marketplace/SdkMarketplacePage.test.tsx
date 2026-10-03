// Opening an SDK app's page reports one page view for that app.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

const postService = vi.fn(async () => ({ error: false }));
vi.mock('../../../api/service', () => ({ postService: (...a: unknown[]) => postService(...(a as [])) }));
vi.mock('../../../widgets/marketplaceRegistry', () => ({
  getMarketplaceListing: () => ({ name: 'Demo', capabilities: {} }),
  marketplaceIdFromType: (t: string) => t.replace('app:', ''),
}));
vi.mock('./useSdkBundle', () => ({
  useSdkBundle: () => ({ entryUrl: null, failed: false }),
  useSdkRuntime: () => ({ runtimeUrl: null, failed: false }),
}));
vi.mock('../../../sandbox/SandboxedWidget', () => ({ SandboxedWidget: () => null }));

import { SdkMarketplacePage } from './SdkMarketplacePage';

afterEach(() => { cleanup(); postService.mockClear(); });

describe('SdkMarketplacePage', () => {
  it('reports one page view per open, and a same-app rerender is not another open', () => {
    const { rerender } = render(<SdkMarketplacePage type="app:com.example.app" />);
    rerender(<SdkMarketplacePage type="app:com.example.app" />);
    expect(postService).toHaveBeenCalledTimes(1);
    expect(postService).toHaveBeenCalledWith('/apps-api/page-opened/com.example.app', {});
  });

  it('closes app A before opening app B when the app changes', () => {
    const { rerender } = render(<SdkMarketplacePage type="app:com.a.app" />);
    postService.mockClear();
    rerender(<SdkMarketplacePage type="app:com.b.app" />);
    expect(postService.mock.calls.map(c => c[0])).toEqual([
      '/apps-api/page-closed/com.a.app',
      '/apps-api/page-opened/com.b.app',
    ]);
  });

  it('reports the open duration when the page unmounts (dev-tools builds)', () => {
    const { unmount } = render(<SdkMarketplacePage type="app:com.example.app" />);
    postService.mockClear();
    unmount();
    expect(postService).toHaveBeenCalledTimes(1);
    expect(postService).toHaveBeenCalledWith('/apps-api/page-closed/com.example.app', { durationMs: expect.any(Number) });
  });
});
