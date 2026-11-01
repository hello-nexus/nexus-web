import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UiSettingsProvider } from '../../../hooks/useUiSettings';
import type { ServiceState } from '../../../types/service';
import { CoolingPage } from './CoolingPage';
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
    fetchCurves: vi.fn(async () => ({
      globalSpeedModifier: 1,
      curves: [{
        id: 'curve-alpha', name: 'Alpha', type: 'Flat',
        input: { id: 'cpu-package', type: 'Temperature', device: '' },
        // fan-gone is saved on purpose but not enumerated right now.
        outputs: [{ id: 'fan-cpu', type: 'Fan' }, { id: 'fan-chassis', type: 'Fan' }, { id: 'fan-gone', type: 'Fan' }],
        flat: { speed: 40 },
      }],
    })),
    fetchProfiles: vi.fn(async () => ({ profiles: [], active: 'custom' })),
    fetchCalibrationResults: vi.fn(async () => ({ results: [] })),
    fetchCoolingPresets: vi.fn(async () => ({ presets: [], activeId: null })),
    applyProfile: vi.fn(async () => undefined),
    saveCurves: vi.fn(async () => undefined),
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


describe('CoolingPage curve fan count', () => {
  it('counts only fans that are present: 2 live plus 1 absent shows 2', async () => {
    renderAdvanced();
    const alphaCell = () => [...document.querySelectorAll('[class*="curveBtnCell"]')]
      .find(c => c.querySelector('[class*="curveBtnName"]')?.textContent === 'Alpha');
    await waitFor(() => expect(alphaCell()?.querySelector('[class*="curveBtnCount"]')).not.toBeNull());
    expect(alphaCell()!.querySelector('[class*="curveBtnCount"]')!.textContent?.trim()).toBe('2');
  }, 20000);
});
