import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsView } from './SettingsView';
import type { UseProfilesResult } from '../../../hooks/useProfiles';

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
      disableConflictAlerts: false,
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

const profiles: UseProfilesResult = {
  profiles: [],
  activeId: '',
  switchProfile: vi.fn(),
  createProfile: vi.fn(),
  renameProfile: vi.fn(),
  deleteProfile: vi.fn(),
  exportProfile: vi.fn(),
  importProfile: vi.fn(),
  reorderProfiles: vi.fn(),
  refresh: vi.fn(),
  loading: false,
};

describe('SettingsView', () => {
  it('renders service-required after the service goes offline', () => {
    const onTabChange = vi.fn();
    const { rerender } = render(
      <SettingsView
        serviceOnline
        connectionState="online"
        platform="windows"
        tab={null}
        onTabChange={onTabChange}
        profiles={profiles}
      />,
    );

    rerender(
      <SettingsView
        serviceOnline={false}
        connectionState="offline-installed"
        platform=""
        tab={null}
        onTabChange={onTabChange}
        profiles={profiles}
      />,
    );

    expect(screen.getByText('service.required.badge')).toBeInTheDocument();
  });
});
