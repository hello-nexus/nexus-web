import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UiSettingsProvider } from '../../../hooks/useUiSettings';
import type { ServiceState } from '../../../types/service';
import { CoolingPage } from './CoolingPage';
import { requestCoolingFan } from '../../../lib/coolingFanIntent';
import { allowSlowAsyncUtils } from '../../../__tests__/slowAsyncUtils';

allowSlowAsyncUtils();

// Rendered outside I18nProvider, so t() falls back to raw keys.

vi.mock('../../../hooks/useSystemSpecs', () => ({
  useSystemSpecs: () => ({ specs: { motherboard: 'ROG STRIX Z790-E' } }),
}));

vi.mock('../../../api/cooling', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../api/cooling')>();
  // Distinct RPMs: the readout is the click target a test selects a card by,
  // the name being a rename field.
  const fan = (id: string, name: string, rpm: number, device?: [string, string]) => ({
    id, name, dutyPercent: 40, rpm, mode: 'Manual',
    classification: 'Controllable', calibrated: true, controlled: true,
    deviceId: device?.[0] ?? null,
    deviceName: device?.[1] ?? null,
  });
  const HUB: [string, string] = ['np50:AABB', 'HYTE NP50'];
  return {
    ...original,
    fetchFanChannels: vi.fn(async () => ({
      channels: [
        fan('fan-cpu', 'CPU Fan', 1100),
        fan('fan-chassis', 'Chassis Fan', 1200),
        fan('fan-rear', 'Rear Fan', 1300),
        fan('fan-hub-1', 'Port 1', 1400, HUB),
        fan('fan-hub-2', 'Port 2', 1500, HUB),
      ],
      groups: [],
    })),
    fetchTemperatureSources: vi.fn(async () => ({
      sources: [{ id: 'cpu-package', name: 'CPU Package', category: 'CPU', value: 52 }],
    })),
    fetchCurves: vi.fn(async () => ({ globalSpeedModifier: 1, curves: [] })),
    fetchProfiles: vi.fn(async () => ({ profiles: [], active: 'custom' })),
    fetchCalibrationResults: vi.fn(async () => ({ results: [] })),
    fetchCoolingPresets: vi.fn(async () => ({ presets: [], activeId: null })),
    applyProfile: vi.fn(async () => undefined),
    saveCurves: vi.fn(async () => undefined),
    saveFanGroups: vi.fn(async () => undefined),
  };
});

const serviceState = { cooling: { calibrating: false } } as unknown as ServiceState;

function renderAdvanced() {
  localStorage.setItem('nexus_settings', JSON.stringify({
    general: { coolingDashboardMode: 'advanced', lightingDashboardMode: 'advanced' },
  }));
  return render(
    <UiSettingsProvider>
      <CoolingPage serviceOnline serviceState={serviceState} />
    </UiSettingsProvider>,
  );
}


const selected = (): string[] => JSON.parse(localStorage.getItem('nexus.cooling.selectedFans') ?? '[]');

describe('CoolingPage fan requested by a device page', () => {
  beforeEach(() => { localStorage.clear(); });

  it('selects the requested fan once the list has loaded', async () => {
    requestCoolingFan('fan-hub-2');
    renderAdvanced();
    await waitFor(() => expect(screen.getByText('CPU Fan')).toBeInTheDocument());
    await waitFor(() => expect(selected()).toEqual(['fan-hub-2']));
  });

  it('selects nothing for a fan that is not listed, and the request does not linger', async () => {
    requestCoolingFan('fan-missing');
    const first = renderAdvanced();
    await waitFor(() => expect(screen.getByText('CPU Fan')).toBeInTheDocument());
    expect(selected()).toEqual([]);
    first.unmount();
    renderAdvanced();
    await waitFor(() => expect(screen.getByText('CPU Fan')).toBeInTheDocument());
    expect(selected()).toEqual([]);
  });
});
