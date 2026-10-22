import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { visibleText } from '../../../../__tests__/panel/visibleText';
import { GaugeValue } from './GaugeValue';

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
