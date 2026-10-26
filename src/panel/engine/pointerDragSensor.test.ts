// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { dragActivationFor, FilteredPointerSensor, type FilteredPointerOptions } from './pointerDragSensor';

describe('dragActivationFor', () => {
  it('drags a plain mouse on distance', () => {
    expect(dragActivationFor('mouse', false)).toBe('distance');
  });
  it('holds first for touch, pen and a mouse standing in for touch', () => {
    expect(dragActivationFor('touch', false)).toBe('delay');
    expect(dragActivationFor('pen', false)).toBe('delay');
    expect(dragActivationFor('mouse', true)).toBe('delay');
    expect(dragActivationFor('touch', true)).toBe('delay');
  });
});

describe('FilteredPointerSensor', () => {
  const [activator] = FilteredPointerSensor.activators;
  const press = (over: Partial<PointerEvent> = {}) => ({ isPrimary: true, button: 0, pointerType: 'mouse', ...over }) as PointerEvent;

  it('activates a press its filter accepts', () => {
    const onActivation = vi.fn();
    const options = { accept: (e: PointerEvent) => e.pointerType === 'mouse', onActivation } as FilteredPointerOptions;
    expect(activator.handler({ nativeEvent: press() }, options)).toBe(true);
    expect(onActivation).toHaveBeenCalledOnce();
  });

  it('declines a press its filter rejects, a secondary button and a non-primary pointer', () => {
    const onActivation = vi.fn();
    const options = { accept: (e: PointerEvent) => e.pointerType === 'mouse', onActivation } as FilteredPointerOptions;
    expect(activator.handler({ nativeEvent: press({ pointerType: 'touch' }) }, options)).toBe(false);
    expect(activator.handler({ nativeEvent: press({ button: 2 }) }, options)).toBe(false);
    expect(activator.handler({ nativeEvent: press({ isPrimary: false }) }, options)).toBe(false);
    expect(onActivation).not.toHaveBeenCalled();
  });
});
