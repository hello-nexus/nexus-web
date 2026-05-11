import { describe, it, expect } from 'vitest';
import { installContextMenuSuppressor } from './ContextMenuManager';

describe('installContextMenuSuppressor', () => {
  it('preventDefaults contextmenu events on the target', () => {
    const uninstall = installContextMenuSuppressor(document);
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    uninstall();
  });

  it('leaves events already defaultPrevented alone', () => {
    const uninstall = installContextMenuSuppressor(document);
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    // Something earlier in the chain (e.g. a component onContextMenu) already
    // handled it. Our suppressor should be a no-op in that case.
    document.body.addEventListener('contextmenu', (e) => e.preventDefault(), { once: true });
    const beforeSuppressor = event.defaultPrevented;
    document.body.dispatchEvent(event);
    expect(beforeSuppressor).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    uninstall();
  });

  it('uninstalls cleanly', () => {
    const uninstall = installContextMenuSuppressor(document);
    uninstall();
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
