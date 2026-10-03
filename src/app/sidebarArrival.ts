// A freshly docked app page announces itself so the sidebar can animate its row.

export interface SidebarArrival {
  key: string;
  /** Slide the row in; false only replays the shine. */
  enter: boolean;
  shines: number;
  /** Distinct per announcement, so a repeat replays the shine. */
  nonce: number;
  /** Runs once the shine ends, or at once when no sidebar can show it. */
  onRevealed?: () => void;
}

type Listener = (arrival: SidebarArrival) => void;

const listeners = new Set<Listener>();
let nonce = 0;

export function announceSidebarArrival(
  key: string,
  options: { enter: boolean; shines?: number; onRevealed?: () => void },
): void {
  nonce += 1;
  // At most once, however many sidebars hear it.
  let revealed = false;
  const onRevealed = options.onRevealed && (() => {
    if (revealed) return;
    revealed = true;
    options.onRevealed?.();
  });
  const arrival: SidebarArrival = { key, enter: options.enter, shines: options.shines ?? 1, nonce, onRevealed };
  if (listeners.size === 0) {
    arrival.onRevealed?.();
    return;
  }
  for (const fn of listeners) fn(arrival);
}

export function subscribeSidebarArrival(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
