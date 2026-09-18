import { createContext, useContext } from 'react';

// macOS delivers an external touchscreen's contacts as MOUSE pointer events
// (no digitizer -> display binding, and WebKit reports no other pointer
// type), so the panel's touch gestures, which listen to DOM touch events,
// never see them. The macOS overlay helper marks its kiosk URL with this
// flag; under it the gesture hooks also accept a primary-button mouse drag
// as a contact. Without the flag every host keeps the plain touch path.
export const TOUCH_VIA_POINTER_PARAM = 'touchViaPointer';

export const TouchViaPointerContext = createContext(false);

export function useTouchViaPointer(): boolean {
  return useContext(TouchViaPointerContext);
}

export function readTouchViaPointerFlag(search: string = typeof window === 'undefined' ? '' : window.location.search): boolean {
  return new URLSearchParams(search).get(TOUCH_VIA_POINTER_PARAM) === '1';
}

// One contact of a swipe gesture, whatever produced it. The swipe hooks are
// written against this so the touch and pointer listeners feed one state
// machine.
export interface GestureContact {
  clientX: number;
  clientY: number;
  target: EventTarget | null;
  timeStamp: number;
  preventDefault(): void;
}

export interface GestureContactHandlers {
  start(contact: GestureContact): void;
  move(contact: GestureContact): void;
  end(): void;
}

function contactFromTouch(e: TouchEvent): GestureContact | null {
  if (e.touches.length !== 1) return null;
  const t = e.touches[0];
  return {
    clientX: t.clientX,
    clientY: t.clientY,
    target: t.target,
    timeStamp: e.timeStamp,
    preventDefault: () => { if (e.cancelable) e.preventDefault(); },
  };
}

function contactFromPointer(e: PointerEvent): GestureContact | null {
  if (e.pointerType !== 'mouse' || !e.isPrimary) return null;
  return {
    clientX: e.clientX,
    clientY: e.clientY,
    target: e.target,
    timeStamp: e.timeStamp,
    // A pointer drag has no scroll to suppress; the touch path's
    // preventDefault stops the page pan, which a mouse never starts.
    preventDefault: () => {},
  };
}

/**
 * Attach a swipe gesture's listeners to `el`. Touch listeners always; the
 * pointer listeners only when `pointerAsTouch` is set (see the module
 * comment). Returns the detach function for the effect cleanup.
 */
export function bindGestureContacts(
  el: HTMLElement,
  pointerAsTouch: boolean,
  handlers: GestureContactHandlers,
): () => void {
  const onTouchStart = (e: TouchEvent) => { const c = contactFromTouch(e); if (c) handlers.start(c); };
  const onTouchMove = (e: TouchEvent) => { const c = contactFromTouch(e); if (c) handlers.move(c); };
  const onTouchEnd = () => handlers.end();
  el.addEventListener('touchstart', onTouchStart, { passive: true });
  el.addEventListener('touchmove', onTouchMove, { passive: false });
  el.addEventListener('touchend', onTouchEnd);
  el.addEventListener('touchcancel', onTouchEnd);

  let detachPointer = () => {};
  if (pointerAsTouch) {
    let down = false;
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const c = contactFromPointer(e);
      if (!c) return;
      down = true;
      handlers.start(c);
    };
    // Moves and the release are read from the document, not captured on
    // the element: pointer capture retargets the pointerup, so a press on
    // a button inside the element would end on the element and the browser
    // would synthesize no click. A finger keeps delivering to where it
    // started without changing what it lands on; this matches that.
    const onPointerMove = (e: PointerEvent) => {
      if (!down) return;
      if ((e.buttons & 1) === 0) { down = false; handlers.end(); return; }
      const c = contactFromPointer(e);
      if (c) handlers.move(c);
    };
    const onPointerEnd = (e: PointerEvent) => {
      if (!down || !contactFromPointer(e)) return;
      down = false;
      handlers.end();
    };
    el.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerEnd);
    document.addEventListener('pointercancel', onPointerEnd);
    detachPointer = () => {
      el.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerEnd);
      document.removeEventListener('pointercancel', onPointerEnd);
    };
  }

  return () => {
    el.removeEventListener('touchstart', onTouchStart);
    el.removeEventListener('touchmove', onTouchMove);
    el.removeEventListener('touchend', onTouchEnd);
    el.removeEventListener('touchcancel', onTouchEnd);
    detachPointer();
  };
}
