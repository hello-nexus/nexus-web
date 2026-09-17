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
  useUnitPrefs: () => ({ monitoringTempUnit: prefs.monitoringTempUnit, timeFormat: '24h', numberFormat: 'dot' }),
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
  fetchBrightnessSchedule: vi.fn().mockResolvedValue({
    enabled: false,
    points: [{ hour: 0, brightness: 20 }, { hour: 12, brightness: 100 }],
    defaults: [{ hour: 0, brightness: 20 }, { hour: 12, brightness: 100 }],
  }),
  setBrightnessSchedule: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../api/lighting', () => ({
  fetchRenderGpu: vi.fn().mockResolvedValue(null),
  setRenderGpu: vi.fn().mockResolvedValue(null),
  restartService: vi.fn().mockResolvedValue(null),
  fetchSleepBlackout: lightingApi.fetchSleepBlackout,
  setSleepBlackout: lightingApi.setSleepBlackout,
  fetchLockBlackout: lightingApi.fetchLockBlackout,
  setLockBlackout: lightingApi.setLockBlackout,
  fetchBrightnessSchedule: lightingApi.fetchBrightnessSchedule,
  setBrightnessSchedule: lightingApi.setBrightnessSchedule,
}));

// The schedule hook subscribes to the lighting topic; no socket in tests.
vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: () => {},
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

  it('keeps the Lighting section for the schedule row before the platform resolves', () => {
    // The blackout rows are platform-gated; the schedule row is not, so the
    // section is never empty, even before the platform ping resolves.
    render(<LightingCoolingSection serviceOnline platform="" />);

    expect(screen.getByText('lighting.title')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'lighting.schedule.row.action' })).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'lighting.lockBlackout.label' })).not.toBeInTheDocument();
    expect(screen.getByText('cooling.title')).toBeInTheDocument();
  });
});

describe('LightingCoolingSection brightness schedule', () => {
  beforeEach(() => {
    lightingApi.fetchBrightnessSchedule.mockReset().mockResolvedValue({
      enabled: false,
      points: [{ hour: 0, brightness: 20 }, { hour: 12, brightness: 100 }],
      defaults: [{ hour: 0, brightness: 20 }, { hour: 12, brightness: 100 }],
    });
    lightingApi.setBrightnessSchedule.mockReset().mockResolvedValue(null);
  });

  it('names the schedule state on the row and opens the editor', async () => {
    render(<LightingCoolingSection serviceOnline platform="windows" />);

    await screen.findByText('lighting.schedule.row.off');

    fireEvent.click(screen.getByRole('button', { name: 'lighting.schedule.row.action' }));

    expect(screen.getByRole('switch', { name: 'lighting.schedule.enable.label' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('lighting.schedule.now.off')).toBeInTheDocument();
  });

  it('turns the schedule on from the editor and reports the live level', async () => {
    render(<LightingCoolingSection serviceOnline platform="windows" />);
    await screen.findByText('lighting.schedule.row.off');
    fireEvent.click(screen.getByRole('button', { name: 'lighting.schedule.row.action' }));

    fireEvent.click(screen.getByRole('switch', { name: 'lighting.schedule.enable.label' }));

    expect(lightingApi.setBrightnessSchedule).toHaveBeenCalledWith({
      enabled: true,
      points: [{ hour: 0, brightness: 20 }, { hour: 12, brightness: 100 }],
    });
    // Optimistic: the row and the readout flip before the POST answers.
    expect(screen.getByText('lighting.schedule.row.on')).toBeInTheDocument();
    expect(screen.getByText('lighting.schedule.now.on')).toBeInTheDocument();
  });

  it('saves one point per hour, mapping the right edge onto the last hour', async () => {
    render(<LightingCoolingSection serviceOnline platform="windows" />);
    await screen.findByText('lighting.schedule.row.off');
    fireEvent.click(screen.getByRole('button', { name: 'lighting.schedule.row.action' }));

    // jsdom has no layout, so drive the graph's commit through a real drag on
    // a stubbed 400x140 chart: pull the 12h point to the far right (hour 24)
    // and the top (100%).
    Element.prototype.setPointerCapture ??= () => {};
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 140, width: 400, height: 140, toJSON: () => ({}),
    } as DOMRect);
    const handles = document.querySelectorAll('svg circle[class*="curvePoint"]');
    const noon = handles[handles.length - 1];
    fireEvent.pointerDown(noon, { pointerId: 1, clientX: 200, clientY: 8 });
    fireEvent.pointerMove(noon, { pointerId: 1, clientX: 600, clientY: -50 });
    fireEvent.pointerUp(noon, { pointerId: 1 });

    expect(lightingApi.setBrightnessSchedule).toHaveBeenCalledWith({
      enabled: false,
      points: [{ hour: 0, brightness: 20 }, { hour: 23, brightness: 100 }],
    });

    // A point dragged onto another's hour collapses into it; the later point
    // on the axis wins.
    lightingApi.setBrightnessSchedule.mockClear();
    const first = document.querySelectorAll('svg circle[class*="curvePoint"]')[0];
    fireEvent.pointerDown(first, { pointerId: 2, clientX: 8, clientY: 120 });
    fireEvent.pointerMove(first, { pointerId: 2, clientX: 600, clientY: 70 });
    fireEvent.pointerUp(first, { pointerId: 2 });
    expect(lightingApi.setBrightnessSchedule).toHaveBeenCalledWith({
      enabled: false,
      points: [{ hour: 23, brightness: 100 }],
    });
  });

  it('resets to the service defaults and disables the reset once there', async () => {
    lightingApi.fetchBrightnessSchedule.mockResolvedValue({
      enabled: true,
      points: [{ hour: 0, brightness: 5 }, { hour: 12, brightness: 100 }],
      defaults: [{ hour: 0, brightness: 20 }, { hour: 12, brightness: 100 }],
    });
    render(<LightingCoolingSection serviceOnline platform="windows" />);
    await screen.findByText('lighting.schedule.row.on');
    fireEvent.click(screen.getByRole('button', { name: 'lighting.schedule.row.action' }));

    const reset = screen.getByRole('button', { name: 'lighting.schedule.reset' });
    expect(reset).toBeEnabled();
    fireEvent.click(reset);

    expect(lightingApi.setBrightnessSchedule).toHaveBeenCalledWith({
      enabled: true,
      points: [{ hour: 0, brightness: 20 }, { hour: 12, brightness: 100 }],
    });
    expect(screen.getByRole('button', { name: 'lighting.schedule.reset' })).toBeDisabled();
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
