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

  it('renders no SMART card on the Overview even when the storage topic carries smart/* components', () => {
    const frame = baseFrame({
      'smart/nvme/0': {
        id: 'smart/nvme/0', name: 'Samsung 990 Pro 1TB', capacity: '', freeSpace: '', usedSpace: '', usedPercentage: '',
        sensors: [
          { id: '/nvme/0/temperature/0', name: 'Composite Temperature', type: 'Temperature', value: 42, units: '°C', formatted: '42.0 °C', parent: { id: '/nvme/0', name: 'Samsung 990 Pro 1TB' } },
        ],
      },
    });

    render(<OverviewTab frame={frame} hist={EMPTY_HIST} gpuSupported={false} onNavigate={vi.fn()} />);

    expect(screen.queryByText('Samsung 990 Pro 1TB')).not.toBeInTheDocument();
    expect(screen.queryByText('Composite Temperature')).not.toBeInTheDocument();
  });
});
