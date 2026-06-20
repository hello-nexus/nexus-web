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
});
