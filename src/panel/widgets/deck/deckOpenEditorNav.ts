// Cross-tree bridge for the blank-key hold-to-edit intent. The desktop
// dashboard (DeckEditAutoOpener) receives the intent - the live 'editRequest'
// multiplex frame when it is already open, or the boot-time
// GET /streamdeck/pending-edit for a hold that fired while it was closed - and
// navigates to the held deck's device page. The mounted StreamDeckDevicePage
// then selects the held key. The target is both stashed (for a page that
// mounts only after the navigation) and announced via a window event (for a
// page already showing that deck), so both timings land. Mirrors
// deckMonitoringNav.ts's decoupling of the router from a non-component caller.
export interface DeckEditorTarget {
  serial: string;
  page: number;
  folderPath: number[];
  keyIndex: number;
}

const NAV_EVENT = 'nexus-deck-open-editor';
let pending: DeckEditorTarget | null = null;

/** Stash the target for the (possibly not-yet-mounted) device page and wake any mounted one. */
export function requestOpenDeckEditor(target: DeckEditorTarget): void {
  pending = target;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(NAV_EVENT));
}

/** The device page for `serial` claims the pending target once (clearing it), or null when none is for this deck. */
export function takePendingDeckEditorTarget(serial: string): DeckEditorTarget | null {
  if (pending && pending.serial === serial) {
    const target = pending;
    pending = null;
    return target;
  }
  return null;
}

export function onDeckOpenEditor(handler: () => void): () => void {
  const listener = () => handler();
  window.addEventListener(NAV_EVENT, listener);
  return () => window.removeEventListener(NAV_EVENT, listener);
}
