import { useSyncExternalStore } from 'react';

const CHANGED_EVENT = 'nexus-pointer-kind';
const MOUSE_QUERIES = ['(hover: hover) and (pointer: fine)', '(any-hover: hover) and (any-pointer: fine)'];

let lastKind: 'mouse' | 'other' | null = null;
let listening = false;

function mediaSaysMouse(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && MOUSE_QUERIES.some(query => window.matchMedia(query).matches);
}

/** A mouse or trackpad is in use: the last real pointer was a mouse, or none was seen yet and the media queries say so. */
export function hasMousePointer(): boolean {
  return lastKind === null ? mediaSaysMouse() : lastKind === 'mouse';
}

function mark(): void {
  if (hasMousePointer()) document.body.setAttribute('data-pointer', 'mouse');
  else document.body.removeAttribute('data-pointer');
}

/**
 * Mirrors hasMousePointer() onto `body[data-pointer='mouse']` for CSS (on body, not html: the hover guard prefixes every :hover rule with an html ancestor). The overlay's
 * WebViews report no hover or pointer capability at all, so the media queries alone
 * never match there; real input is the only signal, and the latest pointer wins: a touch or pen press clears it, a mouse move sets it again.
 */
export function initPointerKind(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  mark();
  const onPointer = (event: PointerEvent) => {
    const next = event.pointerType === 'mouse' ? 'mouse' : event.type === 'pointerdown' ? 'other' : lastKind;
    if (next === lastKind) return;
    const before = hasMousePointer();
    lastKind = next;
    mark();
    if (before !== hasMousePointer()) window.dispatchEvent(new Event(CHANGED_EVENT));
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
  lastKind = null;
  listening = false;
  if (typeof document !== 'undefined') document.body.removeAttribute('data-pointer');
}
