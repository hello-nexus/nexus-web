import type { RefObject } from 'react';

/**
 * Shared open-modal stack. Every open modal/overlay/drawer registers one
 * entry here so a single document-level keydown listener can arbitrate
 * Escape/Enter/Tab against the topmost entry only - independent per-instance
 * listeners would otherwise all fire on one keypress when modals stack.
 */
export interface ModalStackEntry {
  id: string;
  containerRef: RefObject<HTMLElement | null>;
  trapFocus: boolean;
  /** Returns true when it dismissed the modal, so the key event is consumed. */
  onEscape: () => boolean;
  /** Returns true when it acted on the key, so the key event is consumed. */
  onEnter: () => boolean;
}

const stack: ModalStackEntry[] = [];
let listenerAttached = false;

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].map(s => `${s}:not([hidden])`).join(',');

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/**
 * Select's open listbox (and DatePicker-style popups) can portal their
 * interactive content straight onto document.body, outside the modal
 * surface's own subtree. Treat focus there as still "inside" so the trap
 * doesn't yank it back mid-navigation of an open dropdown.
 */
function isWithinPortaledControl(active: Element): boolean {
  return active.closest('[role="listbox"], [role="combobox"]') !== null;
}

/**
 * Wraps Tab/Shift+Tab at the first/last focusable descendant of `container`,
 * and pulls focus back in if it has already left the container by some other
 * means. Leaves non-boundary Tab presses to the browser's native tab order.
 */
export function applyTabTrap(e: KeyboardEvent, container: HTMLElement): void {
  const focusable = getFocusableElements(container);
  const active = document.activeElement;

  if (focusable.length === 0) {
    e.preventDefault();
    container.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const isInside = active instanceof Element
    && (container.contains(active) || isWithinPortaledControl(active));

  if (e.shiftKey) {
    if (!isInside || active === first) {
      e.preventDefault();
      last.focus();
    }
  } else if (!isInside || active === last) {
    e.preventDefault();
    first.focus();
  }
}

function topEntry(): ModalStackEntry | undefined {
  return stack[stack.length - 1];
}

function handleGlobalKeyDown(e: KeyboardEvent) {
  const top = topEntry();
  if (!top) return;

  if (e.key === 'Escape') {
    if (top.onEscape()) e.preventDefault();
    return;
  }
  if (e.key === 'Enter') {
    if (top.onEnter()) e.preventDefault();
    return;
  }
  if (e.key === 'Tab' && top.trapFocus) {
    const container = top.containerRef.current;
    if (container) applyTabTrap(e, container);
  }
}

function ensureListener() {
  if (listenerAttached || typeof document === 'undefined') return;
  // Bubble phase (not capture): a nested control that calls
  // stopPropagation() on its own Escape/Enter handling (e.g. an inline
  // rename field) must still be able to keep the key from reaching this
  // stack, the same way it could suppress a per-instance bubble listener.
  document.addEventListener('keydown', handleGlobalKeyDown);
  listenerAttached = true;
}

function teardownListenerIfEmpty() {
  if (stack.length === 0 && listenerAttached) {
    document.removeEventListener('keydown', handleGlobalKeyDown);
    listenerAttached = false;
  }
}

export function pushModalStackEntry(entry: ModalStackEntry): void {
  stack.push(entry);
  ensureListener();
}

export function removeModalStackEntry(id: string): void {
  const idx = stack.findIndex(e => e.id === id);
  if (idx !== -1) stack.splice(idx, 1);
  teardownListenerIfEmpty();
}

export function isTopmostModalStackEntry(id: string): boolean {
  return topEntry()?.id === id;
}

export function modalStackSize(): number {
  return stack.length;
}

export function resetModalStackForTests(): void {
  stack.length = 0;
  teardownListenerIfEmpty();
}
