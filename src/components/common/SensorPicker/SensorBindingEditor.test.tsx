import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SensorBindingEditor } from './SensorBindingEditor';

vi.mock('../../../lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

// The native <select> stands in for the themed one: these tests exercise the picker's wiring, not the menu.
vi.mock('../Select/Select', () => ({
  Select: ({ value, onChange, options, ariaLabel }: {
    value: string; onChange: (v: string) => void; options?: { value: string; label: string }[]; ariaLabel?: string;
  }) => (
    <select aria-label={ariaLabel} value={value} onChange={e => onChange(e.target.value)}>
      <option value="" />
      {(options ?? []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  ),
}));

const sensor = (id: string, name: string, type: string, value: number, units: string, theoreticalMaximum?: number) => ({
  id, name, type, value, units, formatted: `${value}${units}`, theoreticalMaximum, parent: { id: 'p', name: 'p' },
});

vi.mock('../../../hooks/useSensors', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../hooks/useSensors')>();
  return {
    ...actual,
    useSensors: () => ({
      summary: [
        sensor('summary/cpu-usage', 'CPU Usage', 'Load', 10, '%'),
        sensor('summary/cpu-temp', 'CPU Temperature', 'Temperature', 55, '°C'),
        sensor('summary/cpu-clock', 'CPU Clock', 'Clock', 4200, 'MHz', 6000),
      ],
      cpu: [sensor('cpu/load/0', 'CPU Total', 'Load', 12, '%')],
      gpu: [], gpuModel: '', gpuComponents: [], memory: [], storage: [], storageComponents: {}, storageSensors: [],
      motherboard: [], motherboardModel: '', cpuModel: '', gpuModels: [], memoryTotal: '',
    }),
  };
});
vi.mock('../../../hooks/useSensorExtras', () => ({
  useSensorExtras: () => ({ batteries: [], nics: [], coolers: [], psus: [], nvmeStorage: [], embeddedControllers: [], memoryModules: [] }),
}));

const binding = { category: 'quick', sensor: 'summary/cpu-temp', min: 30, max: 90 };

describe('SensorBindingEditor', () => {
  it('starts a newly picked sensor from its own default range', () => {
    const onChange = vi.fn();
    render(<SensorBindingEditor binding={binding} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('monitoring.settings.sensor'), { target: { value: 'summary/cpu-clock' } });
    expect(onChange).toHaveBeenCalledWith({ category: 'quick', sensor: 'summary/cpu-clock', min: 0, max: 6000 });
  });

  it('moves to the first sensor of another category', () => {
    const onChange = vi.fn();
    render(<SensorBindingEditor binding={binding} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('monitoring.settings.device'), { target: { value: 'cpu' } });
    expect(onChange).toHaveBeenCalledWith({ category: 'cpu', sensor: 'cpu/load/0', min: 0, max: 100 });
  });

  it('commits an edited range on blur and shows the sensor unit', () => {
    const onChange = vi.fn();
    render(<SensorBindingEditor binding={binding} onChange={onChange} />);
    const max = screen.getByLabelText('monitoring.settings.rangeMax (°C)');
    fireEvent.input(max, { target: { value: '80' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(max);
    expect(onChange).toHaveBeenCalledWith({ ...binding, max: 80 });
  });

  it('holds back a range whose minimum is not below its maximum', () => {
    const onChange = vi.fn();
    render(<SensorBindingEditor binding={binding} onChange={onChange} />);
    const min = screen.getByLabelText('monitoring.settings.rangeMin (°C)');
    fireEvent.input(min, { target: { value: '95' } });
    fireEvent.blur(min);
    expect(onChange).not.toHaveBeenCalled();
    expect(min).toHaveAttribute('aria-invalid', 'true');
  });

  it('offers a way back only when the caller says the binding was changed', () => {
    const onReset = vi.fn();
    const { rerender } = render(<SensorBindingEditor binding={binding} onChange={() => {}} />);
    expect(screen.queryByRole('button', { name: 'lighting.sensor.reset' })).toBeNull();
    rerender(<SensorBindingEditor binding={binding} onChange={() => {}} onReset={onReset} />);
    fireEvent.click(screen.getByRole('button', { name: 'lighting.sensor.reset' }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
