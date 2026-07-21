import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsView } from './SettingsView';

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

    expect(screen.getByRole('tab', { name: 'settings.tab.advanced' })).toBeInTheDocument();
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
    // Updates folded into General; Theme/Units no longer live here.
    expect(screen.getByText('settings.language')).toBeInTheDocument();
    expect(screen.getByText('settings.updates.title')).toBeInTheDocument();
    expect(screen.queryByText('settings.theme')).not.toBeInTheDocument();

    rerender(
      <SettingsView serviceOnline connectionState="online" platform="windows" tab="appearance" onTabChange={() => {}} />,
    );
    // 'settings.theme' labels both the section title and the mode row inside it.
    expect(screen.getAllByText('settings.theme').length).toBeGreaterThan(0);
    expect(screen.getByText('settings.background')).toBeInTheDocument();
    expect(screen.getByText('settings.units.time.label')).toBeInTheDocument();
    expect(screen.getByText('settings.units.number.label')).toBeInTheDocument();

    rerender(
      <SettingsView serviceOnline connectionState="online" platform="windows" tab="monitoring" onTabChange={() => {}} />,
    );
    expect(screen.getByText('settings.units.temperature.label')).toBeInTheDocument();

    rerender(
      <SettingsView serviceOnline connectionState="online" platform="windows" tab="privacy" onTabChange={() => {}} />,
    );
    expect(screen.getByText('settings.screentime.title')).toBeInTheDocument();

    rerender(
      <SettingsView serviceOnline connectionState="online" platform="windows" tab="advanced" onTabChange={() => {}} />,
    );
    expect(screen.getByText('settings.diagnostics.title')).toBeInTheDocument();
    expect(screen.getByText('settings.dangerZone')).toBeInTheDocument();
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
