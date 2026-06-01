// Shared "scan mode" coordinator for hover tooltips.
//
// A lone hover tooltip waits TOOLTIP_OPEN_DELAY_MS before opening so an
// incidental cursor pass-through doesn't flash a tooltip on every element the
// pointer crosses. Once any tooltip has opened we enter "scan mode": the next
// tooltip opens instantly. Scan mode lapses TOOLTIP_SKIP_DELAY_MS after the
// last tooltip closes; idle longer than that and the initial delay re-engages.
//
// Mirrors Radix Tooltip's delayDuration / skipDelayDuration provider model,
// but as a module singleton so every HoverTooltip / InfoTooltip shares one
// scan window without a provider wrapped around the tree.

export const TOOLTIP_OPEN_DELAY_MS = 300;
// Grace window after a tooltip closes during which the next tooltip skips the
// open delay. Matched to the open delay: bridges an element-to-element move
// but lapses on a real pause.
const TOOLTIP_SKIP_DELAY_MS = 300;

let scanning = false;
let skipTimer: number | null = null;

function clearSkipTimer() {
  if (skipTimer !== null) {
    window.clearTimeout(skipTimer);
    skipTimer = null;
  }
}

/** Delay before the next tooltip should open: 0 while scanning, the full
 *  initial delay otherwise. Read at the moment a hover schedules an open. */
export function tooltipOpenDelay(): number {
  return scanning ? 0 : TOOLTIP_OPEN_DELAY_MS;
}

/** Call when a tooltip actually becomes visible — enters scan mode so the
 *  next tooltip opens instantly. */
export function notifyTooltipOpen(): void {
  scanning = true;
  clearSkipTimer();
}

/** Call when a tooltip closes — keeps scan mode alive for the brief grace
 *  window so the next element in a scan still opens instantly, then lapses
 *  back to the initial delay. */
export function notifyTooltipClose(): void {
  if (!scanning) return;
  clearSkipTimer();
  skipTimer = window.setTimeout(() => {
    scanning = false;
    skipTimer = null;
  }, TOOLTIP_SKIP_DELAY_MS);
}
