import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CoolingSection } from './CoolingSection';
import { GpuSection } from './GpuSection';
import { StorageSection } from './StorageSection';
import type { DiagnosticsCoolingResponse, DiagnosticsGpuResponse, DiagnosticsSmartResponse } from '../../../api/diagnostics';

// The hook itself is covered through the real provider in
// useUiSettings.test.tsx; here it is stubbed so each section's wiring - which
// id it toggles and what it shows while ignored - is what's under test.
const h = vi.hoisted(() => ({
  ignored: new Set<string>(),
  toggle: vi.fn(),
}));

vi.mock('../../../hooks/useUiSettings', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../hooks/useUiSettings')>();
  return {
    ...actual,
    useIgnoredComponents: () => ({ isIgnored: (id: string) => h.ignored.has(id), toggle: h.toggle }),
  };
});

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const smart: DiagnosticsSmartResponse = {
  supported: true,
  drives: [{
    id: 'storage:Z52AFCNF', name: 'ST2000VX008-2E3164', serial: 'Z52AFCNF', bus: 'sata', sizeBytes: null, temperatureC: null,
    powerOnHours: null, powerCycles: null, healthPercent: null, status: 'caution', statusReasons: ['smart.commandTimeout'],
    attributes: [], nvme: null,
  }],
};

const cooling: DiagnosticsCoolingResponse = {
  supported: true,
  devices: [{ id: 'pump-1', name: 'Pump', type: 'pump', rpm: 0, targetDutyPercent: 60, status: 'stalled', sinceUtc: '2026-01-01T00:00:00Z' }],
};

const gpu: DiagnosticsGpuResponse = {
  supported: true,
  gpus: [{
    name: 'RTX 5080', driverVersion: null, temperatureC: null, powerW: null, recentTdrCount: 0,
    throttle: { active: [], swPowerCapUs: null, swThermalUs: null, hwThermalUs: null, hwPowerBrakeUs: null },
  }],
};

beforeEach(() => {
  h.ignored.clear();
  h.toggle.mockClear();
});

describe('per-device ignore wiring', () => {
  it("a drive card's Monitor switch toggles its own health id and swaps its status badge for Not monitored", () => {
    const { rerender } = render(<StorageSection data={smart} loading={false} error={false} onRefresh={() => {}} />);
    expect(screen.getByText('diagnostics.driveStatus.caution')).toBeInTheDocument();
    const monitor = screen.getByRole('switch', { name: 'diagnostics.monitor.label' });
    expect(monitor).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(monitor);
    expect(h.toggle).toHaveBeenCalledWith('storage:Z52AFCNF');

    h.ignored.add('storage:Z52AFCNF');
    rerender(<StorageSection data={smart} loading={false} error={false} onRefresh={() => {}} />);
    expect(screen.queryByText('diagnostics.driveStatus.caution')).not.toBeInTheDocument();
    expect(screen.getByText('diagnostics.monitor.off')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'diagnostics.monitor.label' })).toHaveAttribute('aria-checked', 'false');
  });

  it('a cooling row prefixes the channel id the way DiagnosticsHealthModel does', () => {
    render(<CoolingSection data={cooling} loading={false} error={false} onRefresh={() => {}} />);
    expect(screen.getByText('diagnostics.cooling.status.stalled')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: 'diagnostics.monitor.label' }));
    expect(h.toggle).toHaveBeenCalledWith('cooling:pump-1');
  });

  it('an ignored cooling row drops the stall badge and its since-label', () => {
    h.ignored.add('cooling:pump-1');
    render(<CoolingSection data={cooling} loading={false} error={false} onRefresh={() => {}} />);
    expect(screen.queryByText('diagnostics.cooling.status.stalled')).not.toBeInTheDocument();
    expect(screen.queryByText(/diagnostics.cooling.since/)).not.toBeInTheDocument();
    expect(screen.getByText('diagnostics.monitor.off')).toBeInTheDocument();
  });

  it('a GPU card uses its NVML ordinal as the id', () => {
    render(<GpuSection data={gpu} loading={false} error={false} onRefresh={() => {}} />);
    fireEvent.click(screen.getByRole('switch', { name: 'diagnostics.monitor.label' }));
    expect(h.toggle).toHaveBeenCalledWith('gpu:0');
  });
});
