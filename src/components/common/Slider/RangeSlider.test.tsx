import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RangeSlider } from './RangeSlider';

function renderRange(value: [number, number], extra: { minGap?: number; step?: number; min?: number; max?: number } = {}) {
  const onChange = vi.fn();
  render(
    <RangeSlider
      label="Temperature"
      value={value}
      min={20}
      max={100}
      ariaLabelMin="Idle"
      ariaLabelMax="Load"
      onChange={onChange}
      {...extra}
    />,
  );
  return {
    onChange,
    minKnob: screen.getByRole('slider', { name: 'Idle' }) as HTMLInputElement,
    maxKnob: screen.getByRole('slider', { name: 'Load' }) as HTMLInputElement,
  };
}

describe('RangeSlider', () => {
  it('keeps the knobs two degrees apart on the fan-curve temperature track', () => {
    const { onChange, minKnob, maxKnob } = renderRange([45, 53]);
    fireEvent.change(maxKnob, { target: { value: '40' } });
    expect(onChange).toHaveBeenLastCalledWith([45, 47], false);
    fireEvent.change(minKnob, { target: { value: '60' } });
    expect(onChange).toHaveBeenLastCalledWith([51, 53], false);
  });

  it('scales the default gap with the span and rounds it to the step grid', () => {
    const { onChange, maxKnob } = renderRange([30, 60], { min: 0, max: 100 });
    fireEvent.change(maxKnob, { target: { value: '10' } });
    expect(onChange).toHaveBeenLastCalledWith([30, 33], false);
  });

  it('never drops the default gap below one step', () => {
    const { onChange, maxKnob } = renderRange([3, 8], { min: 0, max: 10 });
    fireEvent.change(maxKnob, { target: { value: '0' } });
    expect(onChange).toHaveBeenLastCalledWith([3, 4], false);
  });

  it('lets minGap raise the gap', () => {
    const { onChange, maxKnob } = renderRange([45, 60], { minGap: 10 });
    fireEvent.change(maxKnob, { target: { value: '46' } });
    expect(onChange).toHaveBeenLastCalledWith([45, 55], false);
  });

  it('raises the min knob above the max knob only past the track midpoint', () => {
    const { minKnob } = renderRange([90, 92]);
    expect(minKnob.style.zIndex).toBe('1');
  });

  it('leaves the max knob on top in the lower half', () => {
    const { minKnob } = renderRange([30, 32]);
    expect(minKnob.style.zIndex).toBe('');
  });
});
