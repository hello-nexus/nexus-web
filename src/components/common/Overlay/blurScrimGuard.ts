/**
 * Ref-counted opaque-backdrop guard for blur scrims.
 *
 * `backdrop-filter` samples the page's own backdrop. The native glass shells
 * make the web view transparent and App.module.scss drops the fill on `html`,
 * `body` and the layout root so the OS material shows through - which leaves a
 * blur scrim nothing to sample, and it renders as a plain dim over sharp
 * content. Marking the document while a blurring scrim is open lets the layout
 * restore its opaque fill for that span; the scrim covers the window anyway, so
 * the material it hides was not visible.
 *
 * Counted, so a modal opened on top of another does not drop the fill when the
 * inner one closes first. Mirrors backgroundLock's shape.
 */
const SCRIM_CLASS = 'nexus-blur-scrim';

let scrimCount = 0;

export function acquireBlurScrim(): void {
  if (typeof document === 'undefined') return;
  if (scrimCount === 0) document.documentElement.classList.add(SCRIM_CLASS);
  scrimCount++;
}

export function releaseBlurScrim(): void {
  if (typeof document === 'undefined') return;
  scrimCount = Math.max(0, scrimCount - 1);
  if (scrimCount === 0) document.documentElement.classList.remove(SCRIM_CLASS);
}

export function blurScrimCount(): number {
  return scrimCount;
}

export function resetBlurScrimForTests(): void {
  scrimCount = 0;
  if (typeof document !== 'undefined') document.documentElement.classList.remove(SCRIM_CLASS);
}
