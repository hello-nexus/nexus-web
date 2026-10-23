// A mounted SDK app widget tells the service it is running: on mount, then hourly.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

const postService = vi.fn(async () => ({ error: false }));
vi.mock('../../../api/service', () => ({
  postService: (...a: unknown[]) => postService(...(a as [])),
  fetchService: async () => ({ values: {} }),
}));
vi.mock('./useSdkBundle', () => ({
  useSdkBundle: () => ({ entryUrl: null, failed: false }),
  useSdkRuntime: () => ({ runtimeUrl: null, failed: false }),
}));
vi.mock('../../../sandbox/SandboxedWidget', () => ({ SandboxedWidget: () => null }));
vi.mock('../common/PanelPreviewContext', () => ({ usePanelPreview: () => previewFlag }));
let previewFlag = false;

import { SdkMarketplaceWidget } from './SdkMarketplaceWidget';

const listing = { id: 'com.example.app', name: 'Demo', capabilities: {} } as never;

beforeEach(() => { vi.useFakeTimers(); previewFlag = false; });
afterEach(() => { cleanup(); vi.useRealTimers(); postService.mockClear(); });

const usedCalls = () => postService.mock.calls.filter(c => String(c[0]).endsWith('/used'));

describe('SdkMarketplaceWidget usage ping', () => {
  it('pings on mount and again every hour while mounted', () => {
    render(<SdkMarketplaceWidget listing={listing} instanceId="inst-1" size="2x2" />);
    expect(usedCalls().map(c => c[0])).toEqual(['/apps-api/instance/inst-1/used']);
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(usedCalls()).toHaveLength(2);
  });

  it('stops pinging after unmount', () => {
    const { unmount } = render(<SdkMarketplaceWidget listing={listing} instanceId="inst-1" size="2x2" />);
    unmount();
    vi.advanceTimersByTime(3 * 60 * 60 * 1000);
    expect(usedCalls()).toHaveLength(1);
  });

  it('does not ping from a preview', () => {
    previewFlag = true;
    render(<SdkMarketplaceWidget listing={listing} instanceId="inst-1" size="2x2" />);
    expect(usedCalls()).toHaveLength(0);
  });
});
