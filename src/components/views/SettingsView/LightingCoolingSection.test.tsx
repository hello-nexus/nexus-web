import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LightingCoolingSection } from './LightingCoolingSection';
import type { TempUnit } from '../../../lib/units';

// Mutable so a test can flip the unit and re-render, mimicking the C/F chip on
// the same settings page writing through useUiSettings.
const prefs = vi.hoisted(() => ({ monitoringTempUnit: 'c' as TempUnit }));

vi.mock('../../../hooks/useUiSettings', () => ({
  useUiSettings: () => ({
    settings: {
      preferredCpuTempSensorId: '',
      preferredGpuTempSensorId: '',
      monitoringTempUnit: prefs.monitoringTempUnit,
      // Pinned, not 'system': localizeNumbers would otherwise resolve
      // separators from the runtime locale and break on a comma-decimal box.
      numberFormat: 'dot',
    },
    update: vi.fn(),
    reload: vi.fn(),
  }),
}));

const tempSensor = (id: string, name: string, value: number) => ({
  id, name, type: 'Temperature', value, units: '°C',
  formatted: `${value.toFixed(1)} °C`,
  parent: { id: 'hw', name: 'Hardware' },
});

vi.mock('../../../hooks/useSensors', () => ({
  useSensors: () => ({
    cpu: [tempSensor('cpu/temp/pkg', 'CPU Package', 45), tempSensor('cpu/temp/core0', 'CPU Core 0', 50)],
    gpu: [tempSensor('gpu/0/temp', 'GPU Core', 60)],
    gpuComponents: [],
  }),
}));

vi.mock('../../../api/lighting', () => ({
  fetchRenderGpu: vi.fn().mockResolvedValue(null),
  setRenderGpu: vi.fn().mockResolvedValue(null),
  restartService: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('LightingCoolingSection sensor pickers', () => {
  it('labels the CPU/GPU sensors in the selected temperature unit and switches instantly', () => {
    prefs.monitoringTempUnit = 'c';
    const { rerender } = render(<LightingCoolingSection serviceOnline platform="windows" />);

    expect(screen.getByText(/CPU Package \(45\.0°C\)/)).toBeInTheDocument();
    expect(screen.getByText(/GPU Core \(60\.0°C\)/)).toBeInTheDocument();

    // No refetch, no remount: the unit change alone must re-label the pickers.
    prefs.monitoringTempUnit = 'f';
    rerender(<LightingCoolingSection serviceOnline platform="windows" />);

    expect(screen.getByText(/CPU Package \(113\.0°F\)/)).toBeInTheDocument();
    expect(screen.getByText(/GPU Core \(140\.0°F\)/)).toBeInTheDocument();
  });

  it('labels the unselected rows of an open dropdown in the selected unit', () => {
    // Select portals its listbox on open, so the non-selected options only
    // exist in the DOM once the trigger is clicked.
    prefs.monitoringTempUnit = 'f';
    render(<LightingCoolingSection serviceOnline platform="windows" />);

    fireEvent.click(screen.getByRole('button', { name: 'cooling.settings.cpuLabel' }));

    const listbox = screen.getByRole('listbox');
    expect(within(listbox).getByText(/CPU Core 0 \(122\.0°F\)/)).toBeInTheDocument();
    expect(within(listbox).queryByText(/°C/)).not.toBeInTheDocument();
  });
});
