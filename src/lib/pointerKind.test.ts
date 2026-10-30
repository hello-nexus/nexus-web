import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasMousePointer, initPointerKind, resetPointerKindForTests, useHasMousePointer } from './pointerKind';

function pointer(type: string, name = 'pointermove') {
  const event = new Event(name);
  Object.defineProperty(event, 'pointerType', { value: type });
  act(() => { window.dispatchEvent(event); });
}
const noPointerMedia = () => vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q }));
const attr = () => document.body.getAttribute('data-pointer');

describe('pointerKind', () => {
  beforeEach(() => { noPointerMedia(); resetPointerKindForTests(); initPointerKind(); });
  afterEach(() => { vi.unstubAllGlobals(); resetPointerKindForTests(); });

  it('stays unmarked on a pointer-less host and for touch or pen input', () => {
    expect(attr()).toBeNull();
    pointer('touch');
    pointer('pen', 'pointerdown');
    expect(attr()).toBeNull();
    expect(hasMousePointer()).toBe(false);
  });

  it('flips the attribute on the first mouse pointer event', () => {
    pointer('mouse');
    expect(attr()).toBe('mouse');
    expect(hasMousePointer()).toBe(true);
  });

  it('flips on a mouse press too', () => {
    pointer('mouse', 'pointerdown');
    expect(attr()).toBe('mouse');
  });

  it('is marked at start when the media query already reports a mouse', () => {
    resetPointerKindForTests();
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(hover: hover) and (pointer: fine)' }));
    initPointerKind();
    expect(attr()).toBe('mouse');
    expect(hasMousePointer()).toBe(true);
  });

  it('a touch or pen press clears the mouse mark and a later mouse move sets it again', () => {
    pointer('mouse');
    expect(attr()).toBe('mouse');
    pointer('touch', 'pointerdown');
    expect(attr()).toBeNull();
    expect(hasMousePointer()).toBe(false);
    pointer('touch');
    expect(attr()).toBeNull();
    pointer('mouse');
    expect(attr()).toBe('mouse');
    pointer('pen', 'pointerdown');
    expect(hasMousePointer()).toBe(false);
  });

  it('a touch press overrides a media query that reports a mouse, and subscribers see both flips', () => {
    resetPointerKindForTests();
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(hover: hover) and (pointer: fine)' }));
    initPointerKind();
    const { result } = renderHook(() => useHasMousePointer());
    expect(result.current).toBe(true);
    pointer('touch', 'pointerdown');
    expect(result.current).toBe(false);
    pointer('mouse');
    expect(result.current).toBe(true);
  });

  it('re-renders subscribers when the first mouse event arrives', () => {
    const { result } = renderHook(() => useHasMousePointer());
    expect(result.current).toBe(false);
    pointer('mouse');
    expect(result.current).toBe(true);
  });
});
