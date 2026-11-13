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

  describe('one-sided and live use', () => {
    function renderStacked(props: Partial<React.ComponentProps<typeof RangeSlider>> = {}) {
      const onChange = vi.fn();
      const { container } = render(
        <RangeSlider
          orientation="stacked" editable label="Range" value={[30, 70]} min={0} max={100}
          ariaLabelMin="Low" ariaLabelMax="High" onChange={onChange} {...props}
        />,
      );
      return { onChange, container };
    }

    it('hides the low knob and value when lowEnabled is false and runs the band to the left edge', () => {
      const { container } = renderStacked({ lowEnabled: false });
      expect(screen.queryByRole('slider', { name: 'Low' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Low' })).toBeNull();
      expect(screen.getByRole('slider', { name: 'High' })).toBeInTheDocument();
      const band = container.querySelector('[class*="trackBand"]') as HTMLElement;
      expect(band.style.left).toBe('0%');
      expect(band.style.width).toBe('70%');
    });

    it('hides the high knob when highEnabled is false and runs the band to the right edge', () => {
      const { container } = renderStacked({ highEnabled: false });
      expect(screen.queryByRole('slider', { name: 'High' })).toBeNull();
      const band = container.querySelector('[class*="trackBand"]') as HTMLElement;
      expect(band.style.left).toBe('30%');
      expect(band.style.width).toBe('70%');
    });

    it('ignores a hidden side in the gap clamp', () => {
      const { onChange } = renderStacked({ lowEnabled: false, value: [95, 20] });
      fireEvent.change(screen.getByRole('slider', { name: 'High' }), { target: { value: '5' } });
      expect(onChange).toHaveBeenLastCalledWith([95, 5], false);
    });

    it('shades only the enabled outside areas with the tone', () => {
      const { container } = renderStacked({ outsideTone: 'bad', highEnabled: false });
      expect(container.querySelector('[data-outside="low"]')).not.toBeNull();
      expect(container.querySelector('[data-outside="high"]')).toBeNull();
    });

    it('draws no outside shading by default', () => {
      const { container } = renderStacked();
      expect(container.querySelector('[data-outside]')).toBeNull();
    });

    it('keeps the bare layout free of the marker column without a marker', () => {
      const { container } = renderStacked({ orientation: 'bare' });
      expect(container.querySelector('[class*="markedColumn"]')).toBeNull();
    });

    it('draws the live marker caption under the track', () => {
      renderStacked({ marker: { value: 50, label: '50 C' } });
      expect(screen.getByText('50 C')).toBeInTheDocument();
    });

    it('clamps a typed value to the track by default and keeps it with softBounds', () => {
      const { onChange, container } = renderStacked();
      fireEvent.click(screen.getByRole('button', { name: 'High' }));
      const field = container.querySelector('input[type="number"]') as HTMLInputElement;
      fireEvent.change(field, { target: { value: '150' } });
      fireEvent.keyDown(field, { key: 'Enter' });
      expect(onChange).toHaveBeenLastCalledWith([30, 100], true);
    });

    it('accepts a typed value beyond the track with softBounds', () => {
      const { onChange, container } = renderStacked({ softBounds: true });
      fireEvent.click(screen.getByRole('button', { name: 'High' }));
      const field = container.querySelector('input[type="number"]') as HTMLInputElement;
      fireEvent.change(field, { target: { value: '150' } });
      fireEvent.keyDown(field, { key: 'Enter' });
      expect(onChange).toHaveBeenLastCalledWith([30, 150], true);
    });
  });
});

describe('RangeSlider openEnded', () => {
  const open = (props: Partial<React.ComponentProps<typeof RangeSlider>> = {}) => {
    const onChange = vi.fn();
    const view = render(
      <RangeSlider
        orientation="stacked" editable openEnded value={[20, 70]} min={20} max={100} onChange={onChange}
        lowEnabled={false} highEnabled lowOffLabel="No lower limit" highOffLabel="No upper limit"
        ariaLabelMin="Low" ariaLabelMax="High" {...props}
      />,
    );
    return { onChange, ...view };
  };

  it('keeps both knobs, marks the off one hollow and names it in the readout', () => {
    open();
    expect(screen.getByRole('slider', { name: 'Low' })).toHaveAttribute('data-unset', 'true');
    expect(screen.getByRole('slider', { name: 'High' })).not.toHaveAttribute('data-unset');
    expect(screen.getByText('No lower limit')).toBeInTheDocument();
  });

  it('keeps the off knob focusable by keyboard', () => {
    open();
    const low = screen.getByRole('slider', { name: 'Low' });
    expect(low).not.toHaveAttribute('tabindex', '-1');
    expect(low).not.toHaveAttribute('aria-hidden');
  });

  it('commits the track end when an emptied field clears a limit', () => {
    const { onChange } = open({ lowEnabled: true, value: [40, 70] });
    fireEvent.click(screen.getByRole('button', { name: 'Low' }));
    const field = document.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(field, { target: { value: '' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith([20, 70], true);
  });

  it('stops the free knob a gap short of an off knob', () => {
    const { onChange } = open({ highEnabled: false, lowEnabled: true, value: [40, 100] });
    fireEvent.change(screen.getByRole('slider', { name: 'Low' }), { target: { value: '100' } });
    const [next] = onChange.mock.calls.at(-1)![0] as [number, number];
    expect(next).toBeLessThan(100);
  });
});

