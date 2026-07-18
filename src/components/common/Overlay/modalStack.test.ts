import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyTabTrap,
  getFocusableElements,
  isTopmostModalStackEntry,
  modalStackSize,
  pushModalStackEntry,
  removeModalStackEntry,
  resetModalStackForTests,
  type ModalStackEntry,
} from './modalStack';

beforeEach(() => {
  resetModalStackForTests();
  document.body.innerHTML = '';
});

function makeEntry(id: string, container: HTMLElement, overrides: Partial<ModalStackEntry> = {}): ModalStackEntry {
  return {
    id,
    containerRef: { current: container },
    trapFocus: true,
    onEscape: vi.fn(() => true),
    onEnter: vi.fn(() => true),
    ...overrides,
  };
}

describe('modalStack', () => {
  it('tracks stack size and topmost entry across push/remove', () => {
    const a = makeEntry('a', document.createElement('div'));
    const b = makeEntry('b', document.createElement('div'));

    pushModalStackEntry(a);
    expect(modalStackSize()).toBe(1);
    expect(isTopmostModalStackEntry('a')).toBe(true);

    pushModalStackEntry(b);
    expect(modalStackSize()).toBe(2);
    expect(isTopmostModalStackEntry('a')).toBe(false);
    expect(isTopmostModalStackEntry('b')).toBe(true);

    removeModalStackEntry('b');
    expect(modalStackSize()).toBe(1);
    expect(isTopmostModalStackEntry('a')).toBe(true);

    removeModalStackEntry('a');
    expect(modalStackSize()).toBe(0);
  });

  it('removes an entry from the middle of the stack, not just the top', () => {
    const a = makeEntry('a', document.createElement('div'));
    const b = makeEntry('b', document.createElement('div'));
    const c = makeEntry('c', document.createElement('div'));
    pushModalStackEntry(a);
    pushModalStackEntry(b);
    pushModalStackEntry(c);

    removeModalStackEntry('b');

    expect(modalStackSize()).toBe(2);
    expect(isTopmostModalStackEntry('c')).toBe(true);
  });

  it('dispatches Escape to only the topmost entry', () => {
    const a = makeEntry('a', document.createElement('div'));
    const b = makeEntry('b', document.createElement('div'));
    pushModalStackEntry(a);
    pushModalStackEntry(b);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    expect(a.onEscape).not.toHaveBeenCalled();
    expect(b.onEscape).toHaveBeenCalledTimes(1);
  });

  it('dispatches Enter to only the topmost entry', () => {
    const a = makeEntry('a', document.createElement('div'));
    const b = makeEntry('b', document.createElement('div'));
    pushModalStackEntry(a);
    pushModalStackEntry(b);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

    expect(a.onEnter).not.toHaveBeenCalled();
    expect(b.onEnter).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the stack is empty', () => {
    expect(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))).not.toThrow();
  });

  it('lets a nested control suppress the stack via stopPropagation, since the listener is bubble-phase', () => {
    const container = document.createElement('div');
    const input = document.createElement('input');
    container.appendChild(input);
    document.body.appendChild(container);

    const entry = makeEntry('a', container);
    pushModalStackEntry(entry);

    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') e.stopPropagation();
    });
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    expect(entry.onEscape).not.toHaveBeenCalled();
  });
});

describe('getFocusableElements', () => {
  it('finds buttons, links, and inputs but skips disabled/hidden/tabindex=-1 elements', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <button>one</button>
      <button disabled>two</button>
      <a href="#">three</a>
      <input type="text" />
      <div tabindex="0">four</div>
      <div tabindex="-1">five</div>
      <button hidden>six</button>
    `;
    document.body.appendChild(container);

    const found = getFocusableElements(container).map(el => el.textContent?.trim() || el.tagName);
    expect(found).toEqual(['one', 'three', 'INPUT', 'four']);
  });
});

describe('applyTabTrap', () => {
  function setup() {
    const container = document.createElement('div');
    container.innerHTML = '<button id="first">first</button><button id="mid">mid</button><button id="last">last</button>';
    document.body.appendChild(container);
    return {
      container,
      first: container.querySelector('#first') as HTMLElement,
      mid: container.querySelector('#mid') as HTMLElement,
      last: container.querySelector('#last') as HTMLElement,
    };
  }

  it('wraps Tab from the last focusable element to the first', () => {
    const { container, last, first } = setup();
    last.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    applyTabTrap(event, container);
    expect(document.activeElement).toBe(first);
    expect(event.defaultPrevented).toBe(true);
  });

  it('wraps Shift+Tab from the first focusable element to the last', () => {
    const { container, first, last } = setup();
    first.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true });
    applyTabTrap(event, container);
    expect(document.activeElement).toBe(last);
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not intervene when Tab is pressed away from a boundary', () => {
    const { container, mid } = setup();
    mid.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    applyTabTrap(event, container);
    expect(document.activeElement).toBe(mid);
    expect(event.defaultPrevented).toBe(false);
  });

  it('pulls focus back in when it has left the container', () => {
    const { container, first } = setup();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();

    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    applyTabTrap(event, container);
    expect(document.activeElement).toBe(first);
    expect(event.defaultPrevented).toBe(true);
  });

  it('focuses the container itself when it has no focusable descendants', () => {
    const container = document.createElement('div');
    container.tabIndex = -1;
    document.body.appendChild(container);

    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    applyTabTrap(event, container);
    expect(document.activeElement).toBe(container);
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not yank focus back when it is inside a listbox portaled outside the container (Select-style dropdown)', () => {
    const { container } = setup();
    const portal = document.createElement('ul');
    portal.setAttribute('role', 'listbox');
    portal.tabIndex = -1;
    document.body.appendChild(portal);
    portal.focus();

    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    applyTabTrap(event, container);
    expect(document.activeElement).toBe(portal);
    expect(event.defaultPrevented).toBe(false);
  });

  it('does not yank focus back when it is on a combobox input portaled outside the container', () => {
    const { container } = setup();
    const searchInput = document.createElement('input');
    searchInput.setAttribute('role', 'combobox');
    document.body.appendChild(searchInput);
    searchInput.focus();

    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    applyTabTrap(event, container);
    expect(document.activeElement).toBe(searchInput);
    expect(event.defaultPrevented).toBe(false);
  });
});
