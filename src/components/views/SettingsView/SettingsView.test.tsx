import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsView } from './SettingsView';

vi.mock('../../../api/smartPoll', async (importActual) => ({
  ...(await importActual<typeof import('../../../api/smartPoll')>()),
  fetchSmartPoll: vi.fn(async () => null),
}));

vi.mock('../../../api/service', () => ({
  fetchService: vi.fn().mockResolvedValue(null),
  postService: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../hooks/useUiSettings', () => ({
  useUiSettings: () => ({
    settings: {
      language: 'en',
      themeMode: 'dark',
      accentColor: '#7c5cff',
      startOnLogin: false,
      showConflictAlerts: false,
      showMacStatusBarIcon: false,
      showWindowsTrayIcon: false,
      fanChannelOrder: [],
      monitoringTempUnit: 'c',
      timeFormat: 'system',
      numberFormat: 'system',
      startupDelaySeconds: 0,
      featureLightingEnabled: true,
      featureCoolingEnabled: true,
      featureMonitoringEnabled: true,
      featureDiagnosticsEnabled: true,
    },
    update: vi.fn(),
    reload: vi.fn(),
  }),
}));

vi.mock('../../../hooks/useSensors', () => ({
  useSensors: () => ({ cpu: [], gpu: [], gpuComponents: [] }),
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, string>) => (
      vars?.os ? `${key}:${vars.os}` : key
    ),
  }),
}));

vi.mock('../ScreenTimeBrowse/ScreenTimeDataControl', () => ({
  ScreenTimeDataControl: () => null,
}));

describe('SettingsView', () => {
  it('renders service-required after the service goes offline', () => {
    const { rerender } = render(
      <SettingsView serviceOnline connectionState="online" platform="windows" tab="general" onTabChange={() => {}} />,
    );

    rerender(
      <SettingsView serviceOnline={false} connectionState="offline-installed" platform="" tab="general" onTabChange={() => {}} />,
    );

    expect(screen.getByText('service.required.badge')).toBeInTheDocument();
  });

  it('still shows the tab strip while the service is offline', () => {
    render(
      <SettingsView serviceOnline={false} connectionState="offline-installed" platform="" tab="general" onTabChange={() => {}} />,
    );

    expect(screen.getByRole('tab', { name: 'settings.tab.privacyData' })).toBeInTheDocument();
  });

  it('renders exactly 5 tabs, with no Advanced tab', () => {
    render(
      <SettingsView serviceOnline connectionState="online" platform="windows" tab="general" onTabChange={() => {}} />,
    );

    expect(screen.getAllByRole('tab')).toHaveLength(5);
    expect(screen.queryByRole('tab', { name: 'settings.tab.advanced' })).not.toBeInTheDocument();
  });

  it('defaults to the general tab when no subtab is given', () => {
    render(
      <SettingsView serviceOnline connectionState="online" platform="windows" tab={null} onTabChange={() => {}} />,
    );

    expect(screen.getByText('settings.language')).toBeInTheDocument();
  });

  it('falls back to general for an unrecognized tab key', () => {
    render(
      <SettingsView serviceOnline connectionState="online" platform="windows" tab="nonsense" onTabChange={() => {}} />,
    );

    expect(screen.getByText('settings.language')).toBeInTheDocument();
  });

  it('renders each tab’s redistributed content', () => {
    const { rerender } = render(
      <SettingsView serviceOnline connectionState="online" platform="windows" tab="general" onTabChange={() => {}} />,
    );
    // Updates folded into General; Theme/Units no longer live here. Diagnostics
    // & support and the Danger Zone moved here from the dissolved Advanced tab.
    expect(screen.getByText('settings.language')).toBeInTheDocument();
    expect(screen.getByText('settings.updates.title')).toBeInTheDocument();
    expect(screen.getByText('settings.diagnostics.title')).toBeInTheDocument();
    expect(screen.getByText('settings.dangerZone')).toBeInTheDocument();
    expect(screen.queryByText('settings.theme')).not.toBeInTheDocument();

    rerender(
      <SettingsView serviceOnline connectionState="online" platform="windows" tab="appearance" onTabChange={() => {}} />,
    );
    // 'settings.theme' labels both the section title and the mode row inside it.
    expect(screen.getAllByText('settings.theme').length).toBeGreaterThan(0);
    expect(screen.getByText('settings.background')).toBeInTheDocument();
    expect(screen.getByText('settings.units.time.label')).toBeInTheDocument();
    expect(screen.getByText('settings.units.number.label')).toBeInTheDocument();
    expect(screen.queryByText('settings.dangerZone')).not.toBeInTheDocument();

    rerender(
      <SettingsView serviceOnline connectionState="online" platform="windows" tab="lighting-cooling" onTabChange={() => {}} />,
    );
    // Lighting + Cooling master toggles now lead this tab, above the moved
    // LightingCoolingSection sensor/GPU controls.
    expect(screen.getByText('settings.features.lighting.label')).toBeInTheDocument();
    expect(screen.getByText('settings.features.cooling.label')).toBeInTheDocument();
    // 'settings.lightingCooling.title' labels both the active tab strip entry
    // and the moved LightingCoolingSection's own box title.
    expect(screen.getAllByText('settings.lightingCooling.title').length).toBeGreaterThan(0);
    expect(screen.queryByText('settings.dangerZone')).not.toBeInTheDocument();

    rerender(
      <SettingsView serviceOnline connectionState="online" platform="windows" tab="monitoring" onTabChange={() => {}} />,
    );
    // Monitoring + Diagnostics master toggles now lead this tab; the
    // LightingCoolingSection moved out to its own tab.
    expect(screen.getByText('settings.features.monitoring.label')).toBeInTheDocument();
    expect(screen.getByText('settings.features.diagnostics.label')).toBeInTheDocument();
    expect(screen.getByText('settings.units.temperature.label')).toBeInTheDocument();
    // 'settings.lightingCooling.title' always shows as the (inactive) tab
    // strip entry now, so absence of its section is asserted via section-only
    // content instead.
    expect(screen.queryByText('settings.features.lighting.label')).not.toBeInTheDocument();
    expect(screen.queryByText('settings.dangerZone')).not.toBeInTheDocument();

    rerender(
      <SettingsView serviceOnline connectionState="online" platform="windows" tab="privacy" onTabChange={() => {}} />,
    );
    // AI Integration moved here from the dissolved Advanced tab (its own
    // section only mounts once the server status resolves; see
    // AiIntegrationSection.test.tsx for that behavior).
    expect(screen.getByText('settings.screentime.title')).toBeInTheDocument();
    expect(screen.queryByText('settings.features.lighting.label')).not.toBeInTheDocument();
    expect(screen.queryByText('settings.dangerZone')).not.toBeInTheDocument();
  });

  it('calls onTabChange when a different tab is clicked', () => {
    const onTabChange = vi.fn();
    render(
      <SettingsView serviceOnline connectionState="online" platform="windows" tab="general" onTabChange={onTabChange} />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'settings.tab.appearance' }));

    expect(onTabChange).toHaveBeenCalledWith('appearance', expect.anything());
  });
});
