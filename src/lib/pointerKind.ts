import { useSyncExternalStore } from 'react';

const CHANGED_EVENT = 'nexus-pointer-kind';
const MOUSE_QUERIES = ['(hover: hover) and (pointer: fine)', '(any-hover: hover) and (any-pointer: fine)'];

let mouseSeen = false;
let listening = false;

function mediaSaysMouse(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && MOUSE_QUERIES.some(query => window.matchMedia(query).matches);
}

/** A mouse or trackpad is in use: the media queries say so, or a mouse pointer event was seen. */
export function hasMousePointer(): boolean {
  return mouseSeen || mediaSaysMouse();
}

/**
 * Mirrors hasMousePointer() onto `html[data-pointer='mouse']` for CSS. The overlay's
 * WebViews report no hover or pointer capability at all, so the media queries alone
 * never match there; real input is the only signal.
 */
export function initPointerKind(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  const mark = () => document.documentElement.setAttribute('data-pointer', 'mouse');
  if (mediaSaysMouse()) mark();
  const onPointer = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    mouseSeen = true;
    mark();
    window.removeEventListener('pointermove', onPointer, true);
    window.removeEventListener('pointerdown', onPointer, true);
    window.dispatchEvent(new Event(CHANGED_EVENT));
  };
  window.addEventListener('pointermove', onPointer, true);
  window.addEventListener('pointerdown', onPointer, true);
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED_EVENT, onChange);
  return () => window.removeEventListener(CHANGED_EVENT, onChange);
}

export function useHasMousePointer(): boolean {
  return useSyncExternalStore(subscribe, hasMousePointer, () => false);
}

/** Test seam: forgets the seen mouse and the listeners so a case starts from a pointer-less host. */
export function resetPointerKindForTests(): void {
  mouseSeen = false;
  listening = false;
  if (typeof document !== 'undefined') document.documentElement.removeAttribute('data-pointer');
}
