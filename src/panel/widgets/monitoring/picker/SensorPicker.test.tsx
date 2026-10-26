import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SensorPicker, useSensorLookup } from './SensorPicker';

vi.mock('../../../../lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

// The native <select> stands in for the themed one: these tests exercise the picker's wiring, not the menu.
vi.mock('../../../../components/common/Select/Select', () => ({
  Select: ({ value, onChange, options, ariaLabel }: {
    value: string; onChange: (v: string) => void; options?: { value: string; label: string }[]; ariaLabel?: string;
  }) => (
    <select aria-label={ariaLabel} value={value} onChange={e => onChange(e.target.value)}>
      <option value="" />
      {(options ?? []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  ),
}));

const sensor = (id: string, name: string, type: string, value: number, units: string) => ({
  id, name, type, value, units, formatted: `${value}${units}`, parent: { id: 'p', name: 'p' },
});

vi.mock('../../../../hooks/useSensors', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../hooks/useSensors')>();
  return {
    ...actual,
    useSensors: () => ({
      summary: [sensor('summary/cpu-temp', 'CPU Temperature', 'Temperature', 55, '°C')],
      cpu: [sensor('cpu/load/0', 'CPU Total', 'Load', 12, '%')],
      gpu: [], gpuModel: '', gpuComponents: [], memory: [], storage: [], storageComponents: {}, storageSensors: [],
      motherboard: [sensor('mb/fan/1', 'CPU Fan', 'Fan', 1700, 'RPM'), sensor('mb/temp/1', 'Board', 'Temperature', 40, '°C')],
      motherboardModel: '', cpuModel: '', gpuModels: [], memoryTotal: '',
    }),
  };
});
vi.mock('../../../../hooks/useSensorExtras', () => ({
  useSensorExtras: () => ({ batteries: [], nics: [], coolers: [], psus: [], nvmeStorage: [], embeddedControllers: [], memoryModules: [] }),
}));

function Harness(props: Omit<React.ComponentProps<typeof SensorPicker>, 'lookup'>) {
  const lookup = useSensorLookup();
  return <SensorPicker lookup={lookup} {...props} />;
}

const sensorSelect = () => screen.getByLabelText('monitoring.settings.sensor') as HTMLSelectElement;
const categorySelect = () => screen.getByLabelText('monitoring.settings.device') as HTMLSelectElement;

describe('SensorPicker automatic option', () => {
  it('lists the automatic option first', () => {
    render(<Harness category="motherboard" sensor="mb/fan/1" onChange={vi.fn()} sensorTypes={['Fan']} automatic={{ label: 'Auto', active: false, onSelect: vi.fn() }} />);
    const labels = Array.from(sensorSelect().options).map(o => o.textContent).filter(Boolean);
    expect(labels[0]).toBe('Auto');
  });

  it('shows the automatic option selected while active', () => {
    render(<Harness category="motherboard" sensor="" onChange={vi.fn()} automatic={{ label: 'Auto', active: true, onSelect: vi.fn() }} />);
    expect(sensorSelect().selectedOptions[0].textContent).toBe('Auto');
  });

  it('choosing it calls onSelect and not onChange', () => {
    const onChange = vi.fn();
    const onSelect = vi.fn();
    render(<Harness category="motherboard" sensor="mb/fan/1" onChange={onChange} automatic={{ label: 'Auto', active: false, onSelect }} />);
    fireEvent.change(sensorSelect(), { target: { value: Array.from(sensorSelect().options).find(o => o.textContent === 'Auto')!.value } });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('changing the category while automatic sends a concrete sensor', () => {
    const onChange = vi.fn();
    const onSelect = vi.fn();
    render(<Harness category="motherboard" sensor="" onChange={onChange} automatic={{ label: 'Auto', active: true, onSelect }} />);
    fireEvent.change(categorySelect(), { target: { value: 'cpu' } });
    expect(onChange).toHaveBeenCalledWith({ category: 'cpu', sensor: 'cpu/load/0' }, expect.anything());
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('adds no option when the prop is absent', () => {
    render(<Harness category="motherboard" sensor="mb/fan/1" onChange={vi.fn()} />);
    expect(Array.from(sensorSelect().options).some(o => o.textContent === 'Auto')).toBe(false);
  });
});

describe('SensorPicker categories filter', () => {
  it('keeps the current category even when the filter omits it', () => {
    render(<Harness category="cpu" sensor="cpu/load/0" onChange={vi.fn()} categories={[]} />);
    expect(categorySelect().selectedOptions[0].value).toBe('cpu');
  });

  it('offers only the listed categories besides the current one', () => {
    render(<Harness category="cpu" sensor="cpu/load/0" onChange={vi.fn()} categories={['motherboard']} />);
    const values = Array.from(categorySelect().options).map(o => o.value).filter(Boolean);
    expect(values.sort()).toEqual(['cpu', 'motherboard']);
  });
});
