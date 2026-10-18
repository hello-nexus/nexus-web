import { describe, expect, it } from 'vitest';
import { hoverResizeAllowed, hoverTargetId } from './hoverResize';

const base = { pointerType: 'mouse', hoverCapable: true, mouseAsTouch: false, busy: false };

describe('hoverResizeAllowed', () => {
  it('allows a hovering mouse', () => {
    expect(hoverResizeAllowed(base)).toBe(true);
  });

  it('never allows touch or pen input', () => {
    expect(hoverResizeAllowed({ ...base, pointerType: 'touch' })).toBe(false);
    expect(hoverResizeAllowed({ ...base, pointerType: 'pen' })).toBe(false);
  });

  it('is off without hover capability, on a touchscreen that sends mouse pointers, and while busy', () => {
    expect(hoverResizeAllowed({ ...base, hoverCapable: false })).toBe(false);
    expect(hoverResizeAllowed({ ...base, mouseAsTouch: true })).toBe(false);
    expect(hoverResizeAllowed({ ...base, busy: true })).toBe(false);
  });
});

describe('hoverTargetId', () => {
  const dom = () => {
    const root = document.createElement('div');
    root.innerHTML = '<div data-panel-widget-id="w1"><span id="in"></span></div><div data-freeform-frame><button id="corner"></button></div><div id="blank"></div>';
    return root;
  };

  it('names the widget under the pointer', () => {
    expect(hoverTargetId(dom().querySelector('#in'))).toBe('w1');
  });

  it('keeps the current widget while the pointer is on the frame', () => {
    expect(hoverTargetId(dom().querySelector('#corner'))).toBeUndefined();
  });

  it('is null over blank space', () => {
    expect(hoverTargetId(dom().querySelector('#blank'))).toBeNull();
  });
});
