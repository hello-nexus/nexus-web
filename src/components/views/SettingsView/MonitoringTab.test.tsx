import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MonitoringTab } from './MonitoringTab';
import { getDefaultSettings } from '../../../lib/settings';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../../panel/widgets/monitoring/page/MonitoringEventsSettings', () => ({ MonitoringEventsSettings: () => null }));
vi.mock('./SmartPollSection', () => ({ SmartPollSection: () => null }));
vi.mock('./RamTemperatureSection', () => ({ RamTemperatureSection: () => null }));

const update = vi.fn();
const uiSettings = { powerMonitorsEnabled: true, liveDriveActivity: true };
vi.mock('../../../hooks/useUiSettings', () => ({
  useUiSettings: () => ({ settings: uiSettings, update }),
}));

describe('MonitoringTab power monitors toggle', () => {
  beforeEach(() => {
    update.mockClear();
    uiSettings.powerMonitorsEnabled = true;
  });

  const renderTab = () => render(
    <MonitoringTab settings={getDefaultSettings()} updateGeneral={vi.fn()} serviceOnline />,
  );

  it('writes powerMonitorsEnabled=false when toggled off', () => {
    renderTab();
    fireEvent.click(screen.getByRole('switch', { name: /settings.powerMonitors.label/ }));
    expect(update).toHaveBeenCalledWith({ powerMonitorsEnabled: false });
  });

  it('writes true when toggled back on', () => {
    uiSettings.powerMonitorsEnabled = false;
    renderTab();
    fireEvent.click(screen.getByRole('switch', { name: /settings.powerMonitors.label/ }));
    expect(update).toHaveBeenCalledWith({ powerMonitorsEnabled: true });
  });
});

describe('MonitoringTab live drive activity toggle', () => {
  beforeEach(() => {
    update.mockClear();
    uiSettings.liveDriveActivity = true;
  });

  const renderTab = () => render(
    <MonitoringTab settings={getDefaultSettings()} updateGeneral={vi.fn()} serviceOnline />,
  );

  it('writes liveDriveActivity=false when toggled off', () => {
    renderTab();
    fireEvent.click(screen.getByRole('switch', { name: /settings.driveActivity.label/ }));
    expect(update).toHaveBeenCalledWith({ liveDriveActivity: false });
  });

  it('writes true when toggled back on', () => {
    uiSettings.liveDriveActivity = false;
    renderTab();
    fireEvent.click(screen.getByRole('switch', { name: /settings.driveActivity.label/ }));
    expect(update).toHaveBeenCalledWith({ liveDriveActivity: true });
  });
});
