import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OverviewTab } from './OverviewTab';
import type { MonitoringFrame } from '../../../../hooks/useMonitoringFrame';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../../../hooks/useUiSettings', () => ({
  useUiSettings: () => ({
    settings: { preferredGpuId: '', preferredCpuTempSensorId: '', preferredGpuTempSensorId: '' },
  }),
  useUnitPrefs: () => ({ monitoringTempUnit: 'c', timeFormat: 'system', numberFormat: 'system' }),
}));

vi.mock('../../../../lib/monitoringStore', () => ({
  getGpuHist: () => [],
}));

const EMPTY_HIST = { cpu: [], gpu: [], mem: [], netDown: [], netUp: [] };

function baseFrame(storage: MonitoringFrame['storage']): MonitoringFrame {
  return {
    cpu: null,
    gpu: null,
    memory: null,
    storage,
    motherboard: null,
    cpuModel: '',
    gpuModels: [],
    memoryTotal: '',
    motherboardModel: '',
    processes: null,
    network: null,
  };
}

describe('OverviewTab - storage', () => {
  it('excludes smart/*-keyed components from the capacity cards, showing only DriveInfo logical volumes', () => {
    const frame = baseFrame({
      C: { id: 'C', name: 'C', capacity: '1 TB', freeSpace: '500 GB', usedSpace: '500 GB', usedPercentage: '50' },
      'smart/nvme/0': {
        id: 'smart/nvme/0', name: 'Test NVMe', capacity: '', freeSpace: '', usedSpace: '', usedPercentage: '',
        sensors: [{ id: '/nvme/0/temperature/0', name: 'Composite Temperature', type: 'Temperature', value: 42, units: '°C', formatted: '42.0 °C', parent: { id: '/nvme/0', name: 'Test NVMe' } }],
      },
    });

    render(<OverviewTab frame={frame} hist={EMPTY_HIST} gpuSupported={false} onNavigate={vi.fn()} />);

    // The DriveInfo capacity card renders (drive letter + used/capacity text).
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(screen.getByText(/500 GB \/ 1 TB/)).toBeInTheDocument();

    // The smart/* component id never renders as a blank capacity card.
    expect(screen.queryByText('smart/nvme/0')).not.toBeInTheDocument();
    expect(screen.queryByText(/^\s*\/\s*$/)).not.toBeInTheDocument();
  });

  it('renders a distinct SMART card per smart/*-keyed component, with its sensors and model name', () => {
    const frame = baseFrame({
      'smart/nvme/0': {
        id: 'smart/nvme/0', name: 'Samsung 990 Pro 1TB', capacity: '', freeSpace: '', usedSpace: '', usedPercentage: '',
        sensors: [
          { id: '/nvme/0/temperature/0', name: 'Composite Temperature', type: 'Temperature', value: 42, units: '°C', formatted: '42.0 °C', parent: { id: '/nvme/0', name: 'Samsung 990 Pro 1TB' } },
          { id: '/nvme/0/life/0', name: 'Percentage Used', type: 'Level', value: 3, units: '%', formatted: '3 %', parent: { id: '/nvme/0', name: 'Samsung 990 Pro 1TB' } },
        ],
      },
    });

    render(<OverviewTab frame={frame} hist={EMPTY_HIST} gpuSupported={false} onNavigate={vi.fn()} />);

    expect(screen.getByText('Samsung 990 Pro 1TB')).toBeInTheDocument();
    expect(screen.getByText('Composite Temperature')).toBeInTheDocument();
    expect(screen.getByText('42.0 °C')).toBeInTheDocument();
    expect(screen.getByText('Percentage Used')).toBeInTheDocument();
    expect(screen.getByText('3 %')).toBeInTheDocument();
  });

  it('numbers multiple SMART cards when more than one physical drive reports SMART data', () => {
    const frame = baseFrame({
      'smart/nvme/0': { id: 'smart/nvme/0', name: 'Drive A', capacity: '', freeSpace: '', usedSpace: '', usedPercentage: '', sensors: [] },
      'smart/nvme/1': { id: 'smart/nvme/1', name: 'Drive B', capacity: '', freeSpace: '', usedSpace: '', usedPercentage: '', sensors: [] },
    });

    render(<OverviewTab frame={frame} hist={EMPTY_HIST} gpuSupported={false} onNavigate={vi.fn()} />);

    expect(screen.getByText('monitoring.overview.smart 1')).toBeInTheDocument();
    expect(screen.getByText('monitoring.overview.smart 2')).toBeInTheDocument();
  });

  it('renders no SMART card when the storage topic carries no smart/* component', () => {
    const frame = baseFrame({
      C: { id: 'C', name: 'C', capacity: '1 TB', freeSpace: '500 GB', usedSpace: '500 GB', usedPercentage: '50' },
    });

    render(<OverviewTab frame={frame} hist={EMPTY_HIST} gpuSupported={false} onNavigate={vi.fn()} />);

    expect(screen.queryByText(/monitoring\.overview\.smart/)).not.toBeInTheDocument();
  });
});
