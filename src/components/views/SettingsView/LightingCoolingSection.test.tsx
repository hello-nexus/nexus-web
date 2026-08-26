import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const lightingApi = vi.hoisted(() => ({
  // Resolved by default: the sensor-picker tests below mount the same component
  // and would otherwise trip over an undefined return inside its effect.
  fetchSleepBlackout: vi.fn().mockResolvedValue({ enabled: true }),
  setSleepBlackout: vi.fn().mockResolvedValue(null),
  fetchLockBlackout: vi.fn().mockResolvedValue({ enabled: true }),
  setLockBlackout: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../api/lighting', () => ({
  fetchRenderGpu: vi.fn().mockResolvedValue(null),
  setRenderGpu: vi.fn().mockResolvedValue(null),
  restartService: vi.fn().mockResolvedValue(null),
  fetchSleepBlackout: lightingApi.fetchSleepBlackout,
  setSleepBlackout: lightingApi.setSleepBlackout,
  fetchLockBlackout: lightingApi.fetchLockBlackout,
  setLockBlackout: lightingApi.setLockBlackout,
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('LightingCoolingSection section split', () => {
  it('groups sleep blackout under Lighting and the sensor pickers under Cooling', () => {
    render(<LightingCoolingSection serviceOnline platform="windows" />);

    expect(screen.getByText('lighting.title')).toBeInTheDocument();
    expect(screen.getByText('cooling.title')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'lighting.sleepBlackout.label' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'cooling.settings.cpuLabel' })).toBeInTheDocument();
  });

  it('omits the Lighting section entirely when it would have no rows', () => {
    // Lock blackout shows on every desktop platform, so the only real
    // no-rows case is before the platform ping resolves (empty string).
    render(<LightingCoolingSection serviceOnline platform="" />);

    expect(screen.queryByText('lighting.title')).not.toBeInTheDocument();
    expect(screen.getByText('cooling.title')).toBeInTheDocument();
  });
});

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

describe('LightingCoolingSection sleep blackout', () => {
  const toggle = () => screen.getByRole('switch', { name: 'lighting.sleepBlackout.label' });

  beforeEach(() => {
    lightingApi.fetchSleepBlackout.mockReset().mockResolvedValue({ enabled: true });
    lightingApi.setSleepBlackout.mockReset().mockResolvedValue(null);
  });

  it('reflects the service value and persists a change', async () => {
    lightingApi.fetchSleepBlackout.mockResolvedValue({ enabled: false });
    render(<LightingCoolingSection serviceOnline platform="windows" />);

    await waitFor(() => expect(toggle()).toHaveAttribute('aria-checked', 'false'));

    fireEvent.click(toggle());

    expect(lightingApi.setSleepBlackout).toHaveBeenCalledWith(true);
    await waitFor(() => expect(toggle()).toHaveAttribute('aria-checked', 'true'));
  });

  it('reverts the switch when the service rejects the write', async () => {
    lightingApi.setSleepBlackout.mockRejectedValue(new Error('offline'));
    render(<LightingCoolingSection serviceOnline platform="windows" />);

    await waitFor(() => expect(toggle()).toHaveAttribute('aria-checked', 'true'));
    fireEvent.click(toggle());

    // Flips optimistically...
    expect(toggle()).toHaveAttribute('aria-checked', 'false');
    // ...then back, so a failed write never leaves the UI claiming a setting
    // the service did not take.
    await waitFor(() => expect(toggle()).toHaveAttribute('aria-checked', 'true'));
  });

  it('is hidden where the OS gives the service no pre-suspend notification', () => {
    render(<LightingCoolingSection serviceOnline platform="macos" />);

    expect(screen.queryByRole('switch', { name: 'lighting.sleepBlackout.label' })).not.toBeInTheDocument();
    expect(lightingApi.fetchSleepBlackout).not.toHaveBeenCalled();
  });
});

describe('LightingCoolingSection lock blackout', () => {
  const toggle = () => screen.getByRole('switch', { name: 'lighting.lockBlackout.label' });

  beforeEach(() => {
    lightingApi.fetchLockBlackout.mockReset().mockResolvedValue({ enabled: true });
    lightingApi.setLockBlackout.mockReset().mockResolvedValue(null);
  });

  it('reflects the service value and persists a change', async () => {
    lightingApi.fetchLockBlackout.mockResolvedValue({ enabled: false });
    render(<LightingCoolingSection serviceOnline platform="windows" />);

    await waitFor(() => expect(toggle()).toHaveAttribute('aria-checked', 'false'));

    fireEvent.click(toggle());

    expect(lightingApi.setLockBlackout).toHaveBeenCalledWith(true);
    await waitFor(() => expect(toggle()).toHaveAttribute('aria-checked', 'true'));
  });

  it('reverts the switch when the service rejects the write', async () => {
    lightingApi.setLockBlackout.mockRejectedValue(new Error('offline'));
    render(<LightingCoolingSection serviceOnline platform="windows" />);

    await waitFor(() => expect(toggle()).toHaveAttribute('aria-checked', 'true'));
    fireEvent.click(toggle());

    expect(toggle()).toHaveAttribute('aria-checked', 'false');
    await waitFor(() => expect(toggle()).toHaveAttribute('aria-checked', 'true'));
  });

  it('shows on macOS, where sleep blackout does not', async () => {
    // The lock is reported by every desktop OS while the host is still up, so
    // this row is not bound to the pre-suspend notification sleep needs.
    render(<LightingCoolingSection serviceOnline platform="macos" />);

    await waitFor(() => expect(toggle()).toBeInTheDocument());
    expect(lightingApi.fetchLockBlackout).toHaveBeenCalled();
  });
});
