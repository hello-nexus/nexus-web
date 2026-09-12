import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { filterGalleryItems, readGalleryMediaFilter, useGalleryRenderWidth } from './useGallery';

vi.mock('../../../api/service', () => ({
  fetchServiceBlob: vi.fn(() => Promise.resolve(null)),
}));
vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: vi.fn(),
}));

/** A detached element reporting `painted` as its post-transform box. */
function boxPainting(painted: number): HTMLElement {
  const el = document.createElement('div');
  // jsdom leaves clientWidth at 0, so any bucket other than the default here
  // proves the hook read the painted rect and not the layout box.
  el.getBoundingClientRect = () => ({ width: painted, height: painted }) as DOMRect;
  return el;
}

describe('useGalleryRenderWidth', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('buckets from the painted rect, not the untransformed layout box', () => {
    const { result } = renderHook(() => useGalleryRenderWidth());
    act(() => result.current.boxRef(boxPainting(1280)));
    expect(result.current.width).toBe(1280);
  });

  it('scales by device pixel ratio', () => {
    vi.stubGlobal('devicePixelRatio', 2);
    const { result } = renderHook(() => useGalleryRenderWidth());
    act(() => result.current.boxRef(boxPainting(480)));
    expect(result.current.width).toBe(960);
  });

  it('caps the pixel ratio so a dense panel does not pull the largest bucket', () => {
    vi.stubGlobal('devicePixelRatio', 4);
    const { result } = renderHook(() => useGalleryRenderWidth());
    act(() => result.current.boxRef(boxPainting(480)));
    expect(result.current.width).toBe(960);
  });

  it('keeps the default bucket for a box that has not been laid out', () => {
    const { result } = renderHook(() => useGalleryRenderWidth());
    act(() => result.current.boxRef(boxPainting(0)));
    expect(result.current.width).toBe(640);
  });
});

describe('gallery media filter', () => {
  const list = [
    { id: 'a', name: 'a.png', sourceId: 's', kind: 'image' as const },
    { id: 'v', name: 'v.mp4', sourceId: 's', kind: 'video' as const },
  ];

  it('reads the config field and falls back to both for anything unknown', () => {
    expect(readGalleryMediaFilter(undefined)).toBe('both');
    expect(readGalleryMediaFilter({ media: 'videos' })).toBe('videos');
    expect(readGalleryMediaFilter({ media: 'images' })).toBe('images');
    expect(readGalleryMediaFilter({ media: 'nope' })).toBe('both');
  });

  it('narrows by kind and returns the same list untouched for both', () => {
    expect(filterGalleryItems(list, 'both')).toBe(list);
    expect(filterGalleryItems(list, 'images').map(i => i.id)).toEqual(['a']);
    expect(filterGalleryItems(list, 'videos').map(i => i.id)).toEqual(['v']);
  });
});
