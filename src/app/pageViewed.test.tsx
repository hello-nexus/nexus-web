import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const postService = vi.fn();
vi.mock('../api/service', () => ({ postService: (...a: unknown[]) => postService(...a) }));

import { pageViewSlug, usePageViewed } from './pageViewed';

describe('pageViewSlug', () => {
  it('keeps reported views and drops marketplace, tools and unknown views', () => {
    expect(pageViewSlug('smart-lights')).toBe('smart-lights');
    expect(pageViewSlug('diagnostics')).toBe('diagnostics');
    expect(pageViewSlug('build')).toBe('build');
    expect(pageViewSlug('app:com.example.x')).toBeNull();
    expect(pageViewSlug('tools')).toBeNull();
    expect(pageViewSlug('nope')).toBeNull();
  });
});

describe('usePageViewed', () => {
  beforeEach(() => {
    postService.mockReset();
    postService.mockResolvedValue(null);
  });

  it('posts on mount and on a page change, not on rerender', () => {
    const { rerender } = renderHook(({ v }) => usePageViewed(v), { initialProps: { v: 'lighting' } });
    expect(postService).toHaveBeenCalledTimes(1);
    expect(postService.mock.calls[0][0]).toBe('/telemetry/page-viewed/lighting');
    rerender({ v: 'lighting' });
    expect(postService).toHaveBeenCalledTimes(1);
    rerender({ v: 'cooling' });
    expect(postService).toHaveBeenCalledTimes(2);
    expect(postService.mock.calls[1][0]).toBe('/telemetry/page-viewed/cooling');
  });

  it('reports every device page as the generic device slug', () => {
    const { rerender } = renderHook(({ v }) => usePageViewed(v), { initialProps: { v: 'device' } });
    rerender({ v: 'device' });
    expect(postService).toHaveBeenCalledTimes(1);
    expect(postService.mock.calls[0][0]).toBe('/telemetry/page-viewed/device');
  });

  it('skips unreported views', () => {
    renderHook(() => usePageViewed('app:com.example.x'));
    expect(postService).not.toHaveBeenCalled();
  });

  it('swallows failures', async () => {
    postService.mockRejectedValue(new Error('404'));
    expect(() => renderHook(() => usePageViewed('settings'))).not.toThrow();
    await Promise.resolve();
  });
});
