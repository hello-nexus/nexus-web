import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StrictMode } from 'react';
import { renderHook } from '@testing-library/react';

const postService = vi.fn();
vi.mock('../api/service', () => ({ postService: (...a: unknown[]) => postService(...a) }));

import { pageViewSlug, usePageViewed, REPORTED_VIEWS } from './pageViewed';
import { TELEMETRY_EVENTS } from '../telemetry/reference/events';

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

  it('swallows a rejected post', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    postService.mockRejectedValue(new Error('boom'));
    renderHook(() => usePageViewed('settings'));
    await new Promise(r => setTimeout(r, 0));
    process.off('unhandledRejection', unhandled);
    expect(postService).toHaveBeenCalledTimes(1);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('posts once under StrictMode', () => {
    renderHook(() => usePageViewed('lighting'), { wrapper: StrictMode });
    expect(postService).toHaveBeenCalledTimes(1);
  });

  it('does not post for a subtab change, which keeps the same view', () => {
    const { rerender } = renderHook(({ v }) => usePageViewed(v), { initialProps: { v: 'settings' } });
    rerender({ v: 'settings' });
    expect(postService).toHaveBeenCalledTimes(1);
  });

  it('holds the report while not ready (offline or restore pending), then posts the landed page', () => {
    const { rerender } = renderHook(({ v }) => usePageViewed(v), { initialProps: { v: '' } });
    expect(postService).not.toHaveBeenCalled();
    rerender({ v: 'cooling' });
    expect(postService).toHaveBeenCalledTimes(1);
    expect(postService.mock.calls[0][0]).toBe('/telemetry/page-viewed/cooling');
  });

  it('documents exactly the reported slugs in the telemetry reference', () => {
    const doc = TELEMETRY_EVENTS.find(e => e.name === 'page_viewed')!;
    const text = doc.params.find(p => p.name === 'page')!.description;
    const listed = text.replace(/^Page slug: /, '').replace(/\.$/, '').split(', ').map(x => x.split(' ')[0]);
    expect(new Set(listed)).toEqual(new Set(REPORTED_VIEWS));
  });
});
