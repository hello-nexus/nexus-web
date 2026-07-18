/**
 * Ref-counted background lock for open modals: hides page scroll and marks
 * the app root aria-hidden while at least one modal is open. Counted so a
 * modal opened on top of another doesn't unlock/unhide when it closes first.
 */
let lockCount = 0;
let previousHtmlOverflow = '';
let previousBodyOverflow = '';
let previousRootAriaHidden: string | null = null;

export function lockBackground(): void {
  if (typeof document === 'undefined') return;
  if (lockCount === 0) {
    const html = document.documentElement;
    const body = document.body;
    previousHtmlOverflow = html.style.overflow;
    previousBodyOverflow = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';

    const root = document.getElementById('root');
    if (root) {
      previousRootAriaHidden = root.getAttribute('aria-hidden');
      root.setAttribute('aria-hidden', 'true');
    }
  }
  lockCount++;
}

export function unlockBackground(): void {
  if (typeof document === 'undefined') return;
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    const html = document.documentElement;
    const body = document.body;
    html.style.overflow = previousHtmlOverflow;
    body.style.overflow = previousBodyOverflow;

    const root = document.getElementById('root');
    if (root) {
      if (previousRootAriaHidden === null) root.removeAttribute('aria-hidden');
      else root.setAttribute('aria-hidden', previousRootAriaHidden);
    }
    previousRootAriaHidden = null;
  }
}

export function backgroundLockCount(): number {
  return lockCount;
}

export function resetBackgroundLockForTests(): void {
  lockCount = 0;
  previousHtmlOverflow = '';
  previousBodyOverflow = '';
  previousRootAriaHidden = null;
  if (typeof document !== 'undefined') {
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    document.getElementById('root')?.removeAttribute('aria-hidden');
  }
}
