import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchSystemFonts = vi.fn();
vi.mock('../../api/systemFonts', () => ({ fetchSystemFonts: (o?: unknown) => fetchSystemFonts(o) }));

import { renderHook, act } from '@testing-library/react';
import { loadSystemFonts, peekSystemFonts, resetSystemFontsCacheForTests, useSystemFonts } from './systemFontsCache';

describe('system fonts cache', () => {
  beforeEach(() => {
    fetchSystemFonts.mockReset();
    resetSystemFontsCacheForTests();
  });

  it('a peek that finds nothing loaded does not enumerate or cache', async () => {
    fetchSystemFonts.mockResolvedValue({ families: [], loaded: false });
    await peekSystemFonts();
    await peekSystemFonts();
    expect(fetchSystemFonts).toHaveBeenCalledTimes(1);
    expect(fetchSystemFonts).toHaveBeenCalledWith({ peek: true });
  });

  it('shares one enumeration across concurrent callers and reuses it afterwards', async () => {
    fetchSystemFonts.mockResolvedValue({ families: ['A'], loaded: true });
    await Promise.all([loadSystemFonts(), loadSystemFonts()]);
    await loadSystemFonts();
    expect(fetchSystemFonts).toHaveBeenCalledTimes(1);
    expect(fetchSystemFonts).toHaveBeenCalledWith(undefined);
  });

  it('a peek that finds a loaded service fills the cache, so no later enumeration happens', async () => {
    fetchSystemFonts.mockResolvedValue({ families: ['A'], loaded: true });
    await peekSystemFonts();
    await loadSystemFonts();
    expect(fetchSystemFonts).toHaveBeenCalledTimes(1);
  });

  it('a failed enumeration returns to idle and is not cached, so the Load row can retry', async () => {
    fetchSystemFonts.mockResolvedValue({ families: [], loaded: false });
    const h = renderHook(() => useSystemFonts(false));
    await act(async () => { await loadSystemFonts(); });
    expect(h.result.current.status).toBe('idle');
    await act(async () => { await loadSystemFonts(); });
    expect(fetchSystemFonts).toHaveBeenCalledTimes(2);
  });

  it('a successful enumeration that found nothing reads as empty', async () => {
    fetchSystemFonts.mockResolvedValue({ families: [], loaded: true });
    const h = renderHook(() => useSystemFonts(false));
    await act(async () => { await loadSystemFonts(); });
    expect(h.result.current.status).toBe('empty');
  });

  it('hook instances do not fetch until enabled, then share one peek and see a later load', async () => {
    fetchSystemFonts.mockResolvedValue({ families: [], loaded: false });
    const off = renderHook(() => useSystemFonts(false));
    expect(fetchSystemFonts).not.toHaveBeenCalled();
    const a = renderHook(() => useSystemFonts(true));
    const b = renderHook(() => useSystemFonts(true));
    await act(async () => { await peekSystemFonts(); });
    expect(fetchSystemFonts).toHaveBeenCalledTimes(1);
    expect(a.result.current.status).toBe('idle');
    fetchSystemFonts.mockResolvedValue({ families: ['A'], loaded: true });
    await act(async () => { await loadSystemFonts(); });
    expect(fetchSystemFonts).toHaveBeenCalledTimes(2);
    for (const h of [a, b, off]) expect(h.result.current).toEqual({ status: 'loaded', families: ['A'] });
  });
});
