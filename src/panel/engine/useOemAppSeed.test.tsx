import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useOemAppSeed } from './useOemAppSeed';
import {
  _resetMarketplaceRegistryForTests,
  _seedMarketplaceRegistryForTests,
} from '../../widgets/marketplaceRegistry';
import type { AppInstalledListing, AppManifestCapabilities } from '../../widgets/types';
import type { PanelLayout } from '../types';
import type { UiSettingsValue } from '../../hooks/useUiSettings';

function listing(over: Partial<AppInstalledListing>): AppInstalledListing {
  return {
    id: 'x',
    name: 'X',
    version: '1.0.0',
    surfaces: ['dashboard'],
    capabilities: {} as AppManifestCapabilities,
    source: 'bundled',
    trusted: true,
    ...over,
  };
}

function emptyLayout(): PanelLayout {
  return { layoutSchemaVersion: 2, surface: 'desktop', pages: [{ id: 'p0', widgets: [] }] };
}

function uiSettings(over: Partial<UiSettingsValue>): UiSettingsValue {
  return {
    startOnLogin: false,
    backgroundMode: 'glass',
    accentSource: 'system',
    language: 'en',
    themeMode: 'dark',
    accentColor: '#7c5cff',
    showConflictAlerts: true,
    monitoringShowAverage: false,
    monitoringDetailedCollapsed: [],
    showMacStatusBarIcon: true,
    showWindowsTrayIcon: true,
    fanChannelOrder: [],
    preferredCpuTempSensorId: '',
    preferredGpuTempSensorId: '',
    preferredGpuId: '',
    pinnedSidebarApps: [],
    oemAppSeeded: false,
    widgetAdvancedMode: false,
    updateMode: 'always',
    updateChannel: 'production',
    lastDismissedUpdateVersion: '',
    ...over,
  };
}

afterEach(() => _resetMarketplaceRegistryForTests());

describe('useOemAppSeed', () => {
  it('appends the widget + sidebar pin and marks the flag on a fresh profile', async () => {
    _seedMarketplaceRegistryForTests([
      listing({ id: 'com.ibuypower.control', name: 'iBUYPOWER', preinstalled: true, page: true }),
    ]);
    const setLayout = vi.fn();
    const updateUiSettings = vi.fn();

    renderHook(() => useOemAppSeed({
      enabled: true,
      layoutLoaded: true,
      layout: emptyLayout(),
      setLayout,
      capacity: { gridCols: 8, pageRows: 6 },
      uiHydrated: true,
      uiSettings: uiSettings({}),
      updateUiSettings,
    }));

    await waitFor(() => expect(setLayout).toHaveBeenCalledTimes(1));
    const nextLayout: PanelLayout = setLayout.mock.calls[0][0];
    expect(nextLayout.pages[0].widgets.map(w => w.type)).toEqual(['app:com.ibuypower.control']);
    expect(nextLayout.pages[0].widgets[0].size).toBe('2x2');
    expect(updateUiSettings).toHaveBeenCalledWith({
      oemAppSeeded: true,
      pinnedSidebarApps: ['app:com.ibuypower.control'],
    });
  });

  it('does nothing once ui.oemAppSeeded is already true', () => {
    _seedMarketplaceRegistryForTests([
      listing({ id: 'com.ibuypower.control', name: 'iBUYPOWER', preinstalled: true, page: true }),
    ]);
    const setLayout = vi.fn();
    const updateUiSettings = vi.fn();

    renderHook(() => useOemAppSeed({
      enabled: true,
      layoutLoaded: true,
      layout: emptyLayout(),
      setLayout,
      capacity: { gridCols: 8, pageRows: 6 },
      uiHydrated: true,
      uiSettings: uiSettings({ oemAppSeeded: true }),
      updateUiSettings,
    }));

    expect(setLayout).not.toHaveBeenCalled();
    expect(updateUiSettings).not.toHaveBeenCalled();
  });

  it('does nothing on a non-OEM machine (no preinstalled+page listing)', () => {
    _seedMarketplaceRegistryForTests([
      listing({ id: 'com.hellonexus.weather', name: 'Weather', page: true }),
    ]);
    const setLayout = vi.fn();
    const updateUiSettings = vi.fn();

    renderHook(() => useOemAppSeed({
      enabled: true,
      layoutLoaded: true,
      layout: emptyLayout(),
      setLayout,
      capacity: { gridCols: 8, pageRows: 6 },
      uiHydrated: true,
      uiSettings: uiSettings({}),
      updateUiSettings,
    }));

    expect(setLayout).not.toHaveBeenCalled();
    expect(updateUiSettings).not.toHaveBeenCalled();
  });

  it('only marks the flag when the widget and pin are already present', () => {
    _seedMarketplaceRegistryForTests([
      listing({ id: 'com.ibuypower.control', name: 'iBUYPOWER', preinstalled: true, page: true }),
    ]);
    const setLayout = vi.fn();
    const updateUiSettings = vi.fn();
    const layout: PanelLayout = {
      layoutSchemaVersion: 2,
      surface: 'desktop',
      pages: [{ id: 'p0', widgets: [{ id: 'w1', type: 'app:com.ibuypower.control', size: '4x2', col: 0, row: 0 }] }],
    };

    renderHook(() => useOemAppSeed({
      enabled: true,
      layoutLoaded: true,
      layout,
      setLayout,
      capacity: { gridCols: 8, pageRows: 6 },
      uiHydrated: true,
      uiSettings: uiSettings({ pinnedSidebarApps: ['app:com.ibuypower.control'] }),
      updateUiSettings,
    }));

    expect(setLayout).not.toHaveBeenCalled();
    expect(updateUiSettings).toHaveBeenCalledWith({ oemAppSeeded: true });
  });

  it('does nothing while disabled (non-desktop surface)', () => {
    _seedMarketplaceRegistryForTests([
      listing({ id: 'com.ibuypower.control', name: 'iBUYPOWER', preinstalled: true, page: true }),
    ]);
    const setLayout = vi.fn();
    const updateUiSettings = vi.fn();

    renderHook(() => useOemAppSeed({
      enabled: false,
      layoutLoaded: true,
      layout: emptyLayout(),
      setLayout,
      capacity: { gridCols: 8, pageRows: 6 },
      uiHydrated: true,
      uiSettings: uiSettings({}),
      updateUiSettings,
    }));

    expect(setLayout).not.toHaveBeenCalled();
    expect(updateUiSettings).not.toHaveBeenCalled();
  });
});
