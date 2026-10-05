import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { requestSearchScroll, useSearchAnchorScroller } from './scroll';

describe('useSearchAnchorScroller', () => {
  it('scrolls to and shines a mounted anchor element', async () => {
    const el = document.createElement('div');
    el.setAttribute('data-search-anchor', 'set-tray');
    document.body.appendChild(el);
    const spy = vi.spyOn(el, 'scrollIntoView').mockImplementation(() => {});

    renderHook(() => useSearchAnchorScroller());
    requestSearchScroll('set-tray');

    await vi.waitFor(() => {
      expect(el.classList.contains('nexus-search-anchor-active')).toBe(true);
    });
    expect(spy).toHaveBeenCalled();
    el.remove();
  });

  it('does nothing (no throw) when the anchor never mounts', () => {
    renderHook(() => useSearchAnchorScroller());
    expect(() => requestSearchScroll('does-not-exist')).not.toThrow();
  });

  it('detaches its listener on unmount', () => {
    const el = document.createElement('div');
    el.setAttribute('data-search-anchor', 'set-accent');
    document.body.appendChild(el);
    const spy = vi.spyOn(el, 'scrollIntoView').mockImplementation(() => {});
    const { unmount } = renderHook(() => useSearchAnchorScroller());
    unmount();
    requestSearchScroll('set-accent');
    expect(spy).not.toHaveBeenCalled();
    el.remove();
  });

  it('shines the first mounted anchor of a priority list', async () => {
    const second = document.createElement('div');
    second.setAttribute('data-search-anchor', 'b');
    const first = document.createElement('div');
    first.setAttribute('data-search-anchor', 'a');
    document.body.append(second, first);
    const spyFirst = vi.spyOn(first, 'scrollIntoView').mockImplementation(() => {});
    const spySecond = vi.spyOn(second, 'scrollIntoView').mockImplementation(() => {});

    renderHook(() => useSearchAnchorScroller());
    requestSearchScroll(['missing', 'a', 'b']);

    await vi.waitFor(() => {
      expect(first.classList.contains('nexus-search-anchor-active')).toBe(true);
    });
    expect(spyFirst).toHaveBeenCalled();
    expect(spySecond).not.toHaveBeenCalled();
    first.remove();
    second.remove();
  });

  it('a newer request cancels a loop still polling for the older one', async () => {
    renderHook(() => useSearchAnchorScroller());
    requestSearchScroll('late-a');
    requestSearchScroll('late-b');
    const a = document.createElement('div');
    a.setAttribute('data-search-anchor', 'late-a');
    const b = document.createElement('div');
    b.setAttribute('data-search-anchor', 'late-b');
    document.body.append(a, b);
    a.scrollIntoView = vi.fn();
    b.scrollIntoView = vi.fn();
    await vi.waitFor(() => {
      expect(b.classList.contains('nexus-search-anchor-active')).toBe(true);
    });
    expect(a.classList.contains('nexus-search-anchor-active')).toBe(false);
    a.remove();
    b.remove();
  });
});
