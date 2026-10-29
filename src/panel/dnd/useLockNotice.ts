import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { DRAG_CONSUMER_SELECTOR, PANEL_CONTEXT_MENU_TRIGGER_MS } from '../engine/usePanelTouchMode';
import { DRAG_DISTANCE_PX, DRAG_HOLD_TOLERANCE_PX, type DragActivation } from '../engine/pointerDragSensor';

// The tile never travels further than this from its cell.
export const LOCK_DRAG_MAX_PX = 28;

// Controls and grabbed manipulables keep their drag, as do scroll regions; a tap-only SDK stage does not, so the tile can still be pulled.
const INTERACTIVE = `${DRAG_CONSUMER_SELECTOR}, summary, [data-panel-scrollable="true"]`;

/** True when the press landed on a widget's own control, which keeps working on a locked widget. */
export function isOwnControl(target: EventTarget | null, cell: Element | null = null): boolean {
  if (!(target instanceof Element)) return false;
  const hit = target.closest(INTERACTIVE);
  // The sortable cell carries role="button" itself; only a control inside it counts.
  return hit !== null && hit !== cell;
}

export function exceedsDragThreshold(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) > DRAG_DISTANCE_PX;
}

/** Pointer travel mapped to tile travel: 1:1 at first, then ever stiffer, never past `cap`. */
export function rubberBandOffset(dx: number, dy: number, cap = LOCK_DRAG_MAX_PX): { x: number; y: number } {
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return { x: 0, y: 0 };
  const scale = cap * (1 - Math.exp(-dist / cap)) / dist;
  return { x: dx * scale, y: dy * scale };
}

interface Press {
  x: number;
  y: number;
  at: number;
  pointerId: number;
  activation: DragActivation;
}

/**
 * Pointer handlers for a locked widget. A plain tap does nothing. A press that starts a move the way an
 * unlocked widget's would (a short mouse drag, or a touch hold then move) pulls the tile along with
 * rubber-band resistance and shows the locked notice until release, when the tile settles back.
 * A press on a control inside the widget is ignored. Inert when `locked` is false.
 */
export function useLockNotice(locked: boolean, activationFor: (pointerType: string) => DragActivation = () => 'distance') {
  const [offset, setOffset] = useState<{ x: number; y: number } | null>(null);
  const [settling, setSettling] = useState(false);
  const press = useRef<Press | null>(null);
  const dragging = useRef(false);
  // Set once a press became a pull and kept until the next press, so whichever release signal comes second still withholds the tap.
  const pulled = useRef(false);
  // The release of a pull is followed by one native click on the tile; it must not reach the widget.
  const swallowClick = useRef(false);
  const captured = useRef<{ el: Element; id: number } | null>(null);
  // Who is pulling, so a second finger, a pen or a palm elsewhere on the page does not end the pull.
  const puller = useRef<{ id: number; type: string } | null>(null);

  const release = useCallback(() => {
    const held = captured.current;
    captured.current = null;
    if (held?.el.hasPointerCapture?.(held.id)) held.el.releasePointerCapture(held.id);
  }, []);
  const end = useCallback(() => {
    const wasDragging = dragging.current;
    press.current = null;
    dragging.current = false;
    release();
    if (wasDragging) {
      setOffset(null);
      setSettling(true);
    }
    return wasDragging || pulled.current;
  }, [release]);

  const onPointerDown = useCallback((e: PointerEvent) => {
    // Every new press starts clean, whether or not this widget takes it.
    pulled.current = false;
    swallowClick.current = false;
    if (!locked || e.isPrimary === false) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (isOwnControl(e.target, e.currentTarget as Element)) return;
    press.current = { x: e.clientX, y: e.clientY, at: Date.now(), pointerId: e.pointerId, activation: activationFor(e.pointerType) };
    setSettling(false);
  }, [activationFor, locked]);
  const onPointerMove = useCallback((e: PointerEvent) => {
    const origin = press.current;
    if (!locked || !origin || e.pointerId !== origin.pointerId) return;
    // A release the page never saw (a prompt, another app) shows as a move with no button held.
    if (e.buttons === 0 && e.pointerType === 'mouse') {
      end();
      return;
    }
    const dx = e.clientX - origin.x;
    const dy = e.clientY - origin.y;
    if (!dragging.current) {
      if (origin.activation === 'delay' && Date.now() - origin.at < PANEL_CONTEXT_MENU_TRIGGER_MS) {
        // Moving before the hold completes is a swipe or scroll, never a drag.
        if (Math.hypot(dx, dy) > DRAG_HOLD_TOLERANCE_PX) press.current = null;
        return;
      }
      if (!exceedsDragThreshold(dx, dy)) return;
      dragging.current = true;
      pulled.current = true;
      puller.current = { id: e.pointerId, type: e.pointerType };
      const cell = e.currentTarget as Element;
      cell.setPointerCapture?.(e.pointerId);
      captured.current = { el: cell, id: e.pointerId };
    }
    setOffset(rubberBandOffset(dx, dy));
  }, [end, locked]);

  // Only the cell's own capture counts; an inner element's lostpointercapture bubbles up when capture moves to the cell.
  const onLostPointerCapture = useCallback((e: PointerEvent) => {
    const held = captured.current;
    if (held && e.target === e.currentTarget && e.pointerId === held.id) end();
  }, [end]);

  // A real release ends the press; a mouse pull is then followed by one click on the tile, which must not reach the widget.
  const up = useCallback((e: PointerEvent) => {
    const wasPull = end();
    if (wasPull && e.pointerType === 'mouse') swallowClick.current = true;
    return wasPull;
  }, [end]);

  const onClickCapture = useCallback((e: MouseEvent) => {
    if (!swallowClick.current) return;
    swallowClick.current = false;
    // Keyboard activation has no pointer position and is never the release click; an unlocked widget takes every click.
    if (!locked || e.detail === 0) return;
    e.preventDefault();
    e.stopPropagation();
  }, [locked]);

  const isPulled = locked && offset !== null;
  useEffect(() => {
    if (!isPulled) return undefined;
    // A release outside the cell, or one the page missed (the next mouse press), still ends the pull: a non-key macOS kiosk gets no hover moves.
    // Other pointers are ignored; a mouse reuses its id, so any mouse press ends a mouse pull.
    const onPointer = (e: globalThis.PointerEvent) => {
      const who = puller.current;
      if (!who) return;
      const sameMouse = who.type === 'mouse' && e.pointerType === 'mouse';
      if (e.pointerId === who.id || (e.type === 'pointerdown' && sameMouse)) end();
    };
    const ends = ['pointerup', 'pointercancel', 'pointerdown'] as const;
    window.addEventListener('blur', end);
    for (const type of ends) window.addEventListener(type, onPointer, true);
    return () => {
      window.removeEventListener('blur', end);
      for (const type of ends) window.removeEventListener(type, onPointer, true);
    };
  }, [end, isPulled]);

  return {
    /** True while a locked widget is being pulled; the notice shows for exactly that long. */
    dragging: locked && offset !== null,
    visible: locked && offset !== null,
    offset: locked ? offset : null,
    settling: locked && settling,
    /** `end` closes the press on release or cancel and reports whether it was a drag, so the caller can withhold the tap. */
    handlers: { onPointerDown, onPointerMove, end, up, onLostPointerCapture, onClickCapture },
  };
}
