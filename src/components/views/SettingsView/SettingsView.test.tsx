import { render, screen } from '@testing-library/react';
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
      monitoringShowAverage: false,
      showMacStatusBarIcon: false,
      showWindowsTrayIcon: false,
      fanChannelOrder: [],
    },
    update: vi.fn(),
    reload: vi.fn(),
  }),
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
      <SettingsView serviceOnline connectionState="online" platform="windows" />,
    );

    rerender(
      <SettingsView serviceOnline={false} connectionState="offline-installed" platform="" />,
    );

    expect(screen.getByText('service.required.badge')).toBeInTheDocument();
  });
});
