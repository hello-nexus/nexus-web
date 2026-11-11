import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { visibleText } from '../../../../__tests__/panel/visibleText';
import { AdaptiveNumbersContext, GaugeValue } from './GaugeValue';

describe('GaugeValue', () => {
  it('renders each digit in a sizer-backed cell and the unit in the shared unit span', () => {
    const { container } = render(<GaugeValue formatted="2300 RPM" />);
    const sizers = container.querySelectorAll('[aria-hidden="true"]');
    expect(sizers).toHaveLength(4);
    sizers.forEach((s) => expect(s.textContent).toBe('0'));
    expect(visibleText(container)).toBe('2300RPM');
    expect(container.querySelector('.panel-gauge-unit')?.textContent).toBe('RPM');
  });

  it('passes separators and unitless placeholders through without digit cells', () => {
    const { container } = render(<GaugeValue formatted="87.1 °F" />);
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(3);
    expect(visibleText(container)).toBe('87.1°F');

    const dash = render(<GaugeValue formatted="-" />);
    expect(dash.container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(0);
    expect(visibleText(dash.container)).toBe('-');
    expect(dash.container.querySelector('.panel-gauge-unit')).toBeNull();
  });

  it('keeps the value and unit inside one nowrap line box', () => {
    const { container } = render(<GaugeValue formatted="2300 RPM" />);
    const line = container.querySelector('[class*="line"]');
    expect(line).not.toBeNull();
    expect(line!.querySelector('.panel-gauge-unit')).not.toBeNull();
  });

  it('pins the line to the aligned edge and scales from that edge', () => {
    for (const [align, justify] of [['left', 'flex-start'], ['center', 'center'], ['right', 'flex-end']] as const) {
      const { container, unmount } = render(<GaugeValue formatted="2300 RPM" align={align} />);
      const box = container.firstElementChild as HTMLElement;
      const line = box.firstElementChild as HTMLElement;
      expect(box.style.justifyContent).toBe(justify);
      expect(line.style.transformOrigin).toBe(align);
      unmount();
    }
  });

  it('sets neither justify-content nor transform-origin without align', () => {
    const { container } = render(<GaugeValue formatted="2300 RPM" />);
    const box = container.firstElementChild as HTMLElement;
    expect(box.style.justifyContent).toBe('');
    expect((box.firstElementChild as HTMLElement).style.transformOrigin).toBe('');
  });
});

describe('GaugeValue adaptive size', () => {
  const observers: { observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
  const originals: Record<string, PropertyDescriptor | undefined> = {};
  const fontListeners = new Set<string>();
  let slotWidth = 200;

  beforeEach(() => {
    slotWidth = 200;
    class FakeObserver {
      observe = vi.fn();
      disconnect = vi.fn();
      constructor() { observers.push(this); }
    }
    vi.stubGlobal('ResizeObserver', FakeObserver);
    // jsdom has no layout: the slot is 200px square, the line 10px per em wide.
    for (const prop of ['clientWidth', 'clientHeight', 'offsetWidth', 'scrollWidth']) {
      originals[prop] = Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop);
    }
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => slotWidth });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 200 });
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => 50 });
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 160 });
    vi.spyOn(window, 'getComputedStyle').mockImplementation(() => ({ fontSize: '16px' }) as CSSStyleDeclaration);
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        addEventListener: (name: string) => fontListeners.add(name),
        removeEventListener: (name: string) => fontListeners.delete(name),
        ready: Promise.resolve(),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    observers.length = 0;
    fontListeners.clear();
    for (const [prop, desc] of Object.entries(originals)) {
      if (desc) Object.defineProperty(HTMLElement.prototype, prop, desc);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[prop];
    }
    delete (document as unknown as Record<string, unknown>).fonts;
  });

  function slot(formatted: string, on: boolean, innerFraction?: number) {
    return (
      <AdaptiveNumbersContext.Provider value={on}>
        <div data-monitoring-slot-index="0"><GaugeValue formatted={formatted} innerFraction={innerFraction} /></div>
      </AdaptiveNumbersContext.Provider>
    );
  }
  const boxOf = (c: HTMLElement) => c.querySelector('[role="img"]') as HTMLElement;

  it('off path sets no font-size and draws no measuring twin', () => {
    const { container } = render(slot('29 °C', false));
    expect(boxOf(container).style.fontSize).toBe('');
    expect(container.querySelector('[class*="twin"]')).toBeNull();
  });

  it('on path grows past the design size when there is room and never drops below it', () => {
    // The twin is 160px at a 16px font: 10em. 200px * 0.9 / 10em = 18px.
    const roomy = render(slot('29 °C', true));
    expect(parseFloat(boxOf(roomy.container).style.fontSize)).toBe(18);
    roomy.unmount();
    slotWidth = 50;
    const tight = render(slot('29 °C', true));
    expect(parseFloat(boxOf(tight.container).style.fontSize)).toBe(16);
  });

  it('keeps today\'s size inside a ring when the ring fit is below it', () => {
    // 200px * 0.05 / 10em = 1px ring fit, under the 16px floor.
    const { container } = render(slot('29 °C', true, 0.05));
    expect(parseFloat(boxOf(container).style.fontSize)).toBe(16);
  });

  it('keeps the size when the reading ticks within the same unit', () => {
    const { container, rerender } = render(slot('29 °C', true));
    const first = boxOf(container).style.fontSize;
    rerender(slot('98 °C', true));
    expect(boxOf(container).style.fontSize).toBe(first);
    rerender(slot('100 °C', true));
    expect(boxOf(container).style.fontSize).toBe(first);
  });

  it('re-measures when fonts finish loading and cleans up on unmount', () => {
    const { unmount } = render(slot('29 °C', true));
    expect(fontListeners.has('loadingdone')).toBe(true);
    const ro = observers[observers.length - 1];
    unmount();
    expect(ro.disconnect).toHaveBeenCalled();
    expect(fontListeners.has('loadingdone')).toBe(false);
  });
});
