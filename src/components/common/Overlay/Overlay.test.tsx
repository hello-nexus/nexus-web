import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Overlay } from './Overlay';
import { resetModalStackForTests } from './modalStack';
import { resetBackgroundLockForTests } from './backgroundLock';

function tabEvent(shiftKey = false) {
  return new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
}

describe('Overlay a11y mechanism', () => {
  beforeEach(() => {
    resetModalStackForTests();
    resetBackgroundLockForTests();
    document.body.innerHTML = '<div id="root"></div>';
  });

  it('traps Tab focus within the surface and wraps at the boundary', () => {
    render(
      <Overlay open onClose={vi.fn()} ariaLabel="Test">
        <button>first</button>
        <button>last</button>
      </Overlay>,
    );

    screen.getByText('last').focus();
    document.dispatchEvent(tabEvent());
    expect(document.activeElement).toBe(screen.getByText('first'));

    document.dispatchEvent(tabEvent(true));
    expect(document.activeElement).toBe(screen.getByText('last'));
  });

  it('focuses the first focusable element on open by default', () => {
    render(
      <Overlay open onClose={vi.fn()} ariaLabel="Test">
        <button>first</button>
      </Overlay>,
    );
    expect(document.activeElement).toBe(screen.getByText('first'));
  });

  it('focuses the surface itself with autoFocus="container", leaving controls unfocused', () => {
    render(
      <Overlay open onClose={vi.fn()} ariaLabel="Test" autoFocus="container">
        <button>first</button>
      </Overlay>,
    );
    expect(document.activeElement).not.toBe(screen.getByText('first'));
    expect(document.activeElement?.contains(screen.getByText('first'))).toBe(true);
  });

  it('locks background scroll on open and restores it on close, ref-counted across nested modals', () => {
    const outer = render(
      <Overlay open onClose={vi.fn()} ariaLabel="Outer">
        <button>outer</button>
      </Overlay>,
    );
    expect(document.body.style.overflow).toBe('hidden');

    const inner = render(
      <Overlay open onClose={vi.fn()} ariaLabel="Inner">
        <button>inner</button>
      </Overlay>,
    );
    expect(document.body.style.overflow).toBe('hidden');

    inner.unmount();
    expect(document.body.style.overflow).toBe('hidden');

    outer.unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('hides the app root from assistive tech while open and restores it on close', () => {
    const { unmount } = render(
      <Overlay open onClose={vi.fn()} ariaLabel="Test">
        <button>only</button>
      </Overlay>,
    );
    expect(document.getElementById('root')?.getAttribute('aria-hidden')).toBe('true');

    unmount();
    expect(document.getElementById('root')?.hasAttribute('aria-hidden')).toBe(false);
  });

  it('restores focus to the trigger element on close', () => {
    document.body.innerHTML = '<div id="root"></div><button id="trigger">open</button>';
    const trigger = document.getElementById('trigger') as HTMLButtonElement;
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { rerender } = render(
      <Overlay open onClose={vi.fn()} ariaLabel="Test">
        <button>inside</button>
      </Overlay>,
    );
    expect(document.activeElement).not.toBe(trigger);

    rerender(
      <Overlay open={false} onClose={vi.fn()} ariaLabel="Test">
        <button>inside</button>
      </Overlay>,
    );
    expect(document.activeElement).toBe(trigger);
  });

  it('dismisses only the topmost of two stacked modals on Escape', () => {
    const onCloseBottom = vi.fn();
    const onCloseTop = vi.fn();

    render(
      <Overlay open onClose={onCloseBottom} ariaLabel="Bottom">
        <button>bottom</button>
      </Overlay>,
    );
    render(
      <Overlay open onClose={onCloseTop} ariaLabel="Top">
        <button>top</button>
      </Overlay>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onCloseTop).toHaveBeenCalledTimes(1);
    expect(onCloseBottom).not.toHaveBeenCalled();
  });

  it('does not close a noEscDismiss modal on Escape, even when topmost', () => {
    const onClose = vi.fn();
    render(
      <Overlay open onClose={onClose} noEscDismiss ariaLabel="Locked">
        <button>locked</button>
      </Overlay>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
