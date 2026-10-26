import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { CoolingPage } from './CoolingPage';
import type { ServiceState } from '../../../hooks/useServiceState';
import { UiSettingsProvider } from '../../../hooks/useUiSettings';

// Rendered outside I18nProvider, so t() falls back to raw keys.

vi.mock('../../../api/cooling', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../api/cooling')>();
  return {
    ...original,
    fetchFanChannels: vi.fn(async () => ({ channels: [{ id: 'fan-cpu', name: 'CPU Fan', dutyPercent: 42, rpm: 1180, mode: 'Manual', classification: 'Controllable', calibrated: true }] })),
    fetchTemperatureSources: vi.fn(async () => ({ sources: [{ id: 'cpu-package', name: 'CPU Package', category: 'CPU', value: 52 }] })),
    fetchCurves: vi.fn(async () => ({ globalSpeedModifier: 1, curves: [] })),
    fetchProfiles: vi.fn(async () => ({ profiles: [], active: 'custom' })),
    fetchCalibrationResults: vi.fn(async () => ({ results: [] })),
    fetchCoolingPresets: vi.fn(async () => ({ presets: [], activeId: null })),
  };
});
vi.mock('./case3d/CoolingCase3D', () => ({ CoolingCase3D: () => <div data-testid="case3d" /> }));

const serviceState = { cooling: { calibrating: false } } as unknown as ServiceState;

describe('CoolingPage canvas header', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('nexus_settings', JSON.stringify({ general: { coolingDashboardMode: 'advanced', lightingDashboardMode: 'advanced' } }));
  });

  const mount = () => render(<UiSettingsProvider><CoolingPage serviceOnline serviceState={serviceState} /></UiSettingsProvider>);

  it('puts the title and the selection badge on the left and the view switch at the right end', async () => {
    mount();
    const group = await screen.findByRole('radiogroup', { name: 'cooling.case3d.viewSwitch' });
    const header = group.parentElement as HTMLElement;
    const kids = [...header.children];
    expect(kids[0].textContent).toBe('cooling.label.curves');
    expect(kids.indexOf(group)).toBe(kids.length - 1);
    expect(kids.findIndex(k => /lighting\.pane\.selectedCount|selectedCount|cooling\.|lighting\./.test(k.textContent ?? '') && k !== kids[0] && k !== group)).toBeGreaterThan(0);
  });

  it('labels the segments Curves and Airflow with 2D and 3D pills', async () => {
    mount();
    const radios = within(await screen.findByRole('radiogroup', { name: 'cooling.case3d.viewSwitch' })).getAllByRole('radio');
    expect(radios[0].textContent).toContain('lighting.scene.view.2d');
    expect(radios[0].textContent).toContain('cooling.view.curves');
    expect(radios[1].textContent).toContain('lighting.scene.view.3d');
    expect(radios[1].textContent).toContain('cooling.view.airflow');
    expect(radios[1].textContent).not.toMatch(/[[\]]/);
  });

  it('never changes the title when the view changes', async () => {
    mount();
    const radios = within(await screen.findByRole('radiogroup', { name: 'cooling.case3d.viewSwitch' })).getAllByRole('radio');
    expect(screen.getAllByText('cooling.label.curves').length).toBeGreaterThan(0);
    fireEvent.click(radios[1]);
    await waitFor(() => expect(screen.getByTestId('case3d')).toBeTruthy());
    expect(screen.getAllByText('cooling.label.curves').length).toBeGreaterThan(0);
    expect(screen.queryByText('cooling.case3d.title')).toBeNull();
  });
});
