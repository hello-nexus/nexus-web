import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PANEL_LOCKED_VIEWPORT_CONTENT, usePanelViewportLock } from './usePanelViewportLock';

function ViewportLockHost() {
  usePanelViewportLock();
  return null;
}

function viewportMeta() {
  return document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
}

describe('usePanelViewportLock', () => {
  afterEach(() => {
    viewportMeta()?.remove();
  });

  it('locks the viewport against panel zoom while mounted', () => {
    const meta = document.createElement('meta');
    meta.name = 'viewport';
    meta.content = 'width=device-width, initial-scale=1.0, viewport-fit=cover';
    document.head.appendChild(meta);

    const { unmount } = render(<ViewportLockHost />);

    expect(viewportMeta()?.content).toBe(PANEL_LOCKED_VIEWPORT_CONTENT);

    unmount();

    expect(viewportMeta()?.content).toBe('width=device-width, initial-scale=1.0, viewport-fit=cover');
  });

  it('creates and removes a viewport meta tag if the document does not have one', () => {
    const { unmount } = render(<ViewportLockHost />);

    expect(viewportMeta()?.content).toBe(PANEL_LOCKED_VIEWPORT_CONTENT);

    unmount();

    expect(viewportMeta()).toBeNull();
  });

  it('prevents WebKit gesture zoom events while mounted', () => {
    render(<ViewportLockHost />);

    const event = new Event('gesturestart', { bubbles: true, cancelable: true });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});
