import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UiSettingsProvider } from '../../../hooks/useUiSettings';
import type { ServiceState } from '../../../types/service';
import { CoolingPage } from './CoolingPage';
import styles from './CoolingPage.module.scss';
import { allowSlowAsyncUtils } from '../../../__tests__/slowAsyncUtils';

allowSlowAsyncUtils();

vi.mock('../../../api/cooling', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../api/cooling')>();
  const fan = (id: string, name: string, extra: object = {}) => ({
    id, name, dutyPercent: 42, rpm: 1180, mode: 'Manual', classification: 'Controllable', calibrated: true, ...extra,
  });
  return {
    ...original,
    fetchFanChannels: vi.fn(async () => ({
      channels: [
        fan('fan-a', 'Front Fan'),
        fan('fan-pump', 'Pump', { pinned: true }),
        fan('fan-off', 'Rear Fan', { controlled: false }),
      ],
    })),
    fetchTemperatureSources: vi.fn(async () => ({ sources: [] })),
    fetchCurves: vi.fn(async () => ({ globalSpeedModifier: 1, curves: [] })),
    fetchProfiles: vi.fn(async () => ({ profiles: [], active: 'custom' })),
    fetchCalibrationResults: vi.fn(async () => ({ results: [] })),
    fetchCoolingPresets: vi.fn(async () => ({ presets: [], activeId: null })),
  };
});

const serviceState = { cooling: { calibrating: false } } as unknown as ServiceState;

describe('CoolingPage preset tab hover', () => {
  it('outlines the fans a hovered preset would retarget, skipping pinned and uncontrolled ones', async () => {
    localStorage.setItem('nexus_settings', JSON.stringify({ general: { coolingDashboardMode: 'advanced' } }));
    render(
      <UiSettingsProvider>
        <CoolingPage serviceOnline serviceState={serviceState} />
      </UiSettingsProvider>,
    );
    await screen.findAllByText('Front Fan');
    const withClass = (cls: string) => ['Front Fan', 'Pump', 'Rear Fan']
      .filter(n => screen.getAllByText(n).some(el => el.closest(`.${styles.fanCard}`)?.className.includes(cls)));
    const outlined = () => withClass(styles.fanCardTarget);
    const tab = screen.getByRole('tab', { name: /cooling\.mode\.silent/ });

    expect(outlined()).toEqual([]);
    fireEvent.pointerEnter(tab, { pointerType: 'touch' });
    expect(outlined()).toEqual([]);
    fireEvent.pointerEnter(tab, { pointerType: 'mouse' });
    expect(outlined()).toEqual(['Front Fan']);
    fireEvent.pointerLeave(tab, { pointerType: 'mouse' });
    expect(outlined()).toEqual([]);
  });

  it('previews nothing on the active preset, whose press retargets nothing', async () => {
    localStorage.setItem('nexus_settings', JSON.stringify({ general: { coolingDashboardMode: 'advanced' } }));
    render(
      <UiSettingsProvider>
        <CoolingPage serviceOnline serviceState={serviceState} />
      </UiSettingsProvider>,
    );
    await screen.findAllByText('Front Fan');
    const active = await waitFor(() => {
      const tab = screen.getAllByRole('tab').find(el => el.getAttribute('aria-selected') === 'true' && /cooling\.mode\./.test(el.textContent ?? ''));
      expect(tab).toBeTruthy();
      return tab!;
    });
    fireEvent.pointerEnter(active, { pointerType: 'mouse' });
    expect(document.querySelector(`.${styles.fanCardTarget}`)).toBeNull();
  });
});
