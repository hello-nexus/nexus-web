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
});
