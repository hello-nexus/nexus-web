import { useEffect, type RefObject } from 'react';

/**
 * Close-on-outside-click for dropdown popovers. Binds a `mousedown` listener
 * on the document while `enabled` is true; fires `onClose()` when the click
 * target is not a descendant of `ref`.
 *
 * Uses `mousedown` (not `click`) so the popover closes before any embedded
 * button's onClick fires.
 */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onClose: () => void,
  enabled: boolean = true,
): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: MouseEvent) => {
      const el = ref.current;
      if (el && !el.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [enabled, ref, onClose]);
}
