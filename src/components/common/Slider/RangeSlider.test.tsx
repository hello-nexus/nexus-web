import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RangeSlider } from './RangeSlider';

function renderRange(value: [number, number], extra: { minGap?: number; step?: number } = {}) {
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
  it('lets the knobs close to one step apart by default', () => {
    // Fan-curve thresholds need a one-degree band.
    const { onChange, maxKnob } = renderRange([45, 53]);
    fireEvent.change(maxKnob, { target: { value: '46' } });
    expect(onChange).toHaveBeenLastCalledWith([45, 46], false);
  });

  it('clamps each knob one step short of the other', () => {
    const { onChange, minKnob, maxKnob } = renderRange([45, 53]);
    fireEvent.change(maxKnob, { target: { value: '40' } });
    expect(onChange).toHaveBeenLastCalledWith([45, 46], false);
    fireEvent.change(minKnob, { target: { value: '60' } });
    expect(onChange).toHaveBeenLastCalledWith([52, 53], false);
  });

  it('still honours an explicit minGap', () => {
    const { onChange, maxKnob } = renderRange([45, 60], { minGap: 10 });
    fireEvent.change(maxKnob, { target: { value: '46' } });
    expect(onChange).toHaveBeenLastCalledWith([45, 55], false);
  });

  it('raises the min knob above the max knob only past the track midpoint', () => {
    const { minKnob } = renderRange([90, 91]);
    expect(minKnob.style.zIndex).toBe('1');
  });

  it('leaves the max knob on top in the lower half', () => {
    const { minKnob } = renderRange([30, 31]);
    expect(minKnob.style.zIndex).toBe('');
  });
});
