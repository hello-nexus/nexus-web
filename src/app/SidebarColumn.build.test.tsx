import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const settings = vi.hoisted(() => ({
  pinnedSidebarApps: ['build', 'monitoring', 'lighting', 'cooling', 'diagnostics', 'store'],
  sidebarAppOrder: ['build'],
  featureMonitoringEnabled: true,
  featureLightingEnabled: true,
  featureCoolingEnabled: true,
  featureDiagnosticsEnabled: true,
}));
vi.mock('../hooks/useUiSettings', () => ({
  useUiSettings: () => ({ settings, update: vi.fn() }),
}));
vi.mock('../hooks/useSessionRecents', () => ({
  useSessionRecents: () => ({ recents: [], loaded: true, setRecents: vi.fn() }),
}));
vi.mock('./SidebarDevicesSection', () => ({ SidebarDevicesSection: () => null }));
vi.mock('./PairPhoneModal', () => ({ PairPhoneButton: () => null }));
vi.mock('./sidebar', () => ({ SidebarBrand: () => null }));

import { SidebarColumn } from './SidebarColumn';

function rowKeys(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-sidebar-row-key]')).map(el => el.getAttribute('data-sidebar-row-key') ?? '');
}

function renderColumn(active: string) {
  return render(
    <SidebarColumn
      compact={false}
      online
      serviceState={'online' as never}
      serviceNavActive={active}
      onServiceNavChange={vi.fn()}
      portalNav={[]}
      portalNavActive=""
      onPortalNavChange={vi.fn()}
      remoteControlEnabled={false}
      phoneSubscribers={0}
      onPairPhoneOpen={vi.fn()}
      activeDeviceKey=""
      onDeviceSelect={vi.fn()}
      onDevicesHeaderClick={vi.fn()}
      devicesHeaderActive={false}
      onOpenFirmware={vi.fn()}
    />,
  );
}

describe('SidebarColumn Build row', () => {
  it('renders Build once, right after Diagnostics and before the store, despite a stored pin', () => {
    const { container } = renderColumn('monitoring');
    const keys = rowKeys(container);
    expect(keys.slice(0, 6)).toEqual(['monitoring', 'lighting', 'cooling', 'diagnostics', 'build', 'store']);
    expect(keys.filter(k => k === 'build')).toHaveLength(1);
  });

  it('marks the Build row active on the build route', () => {
    const { container } = renderColumn('build');
    const cls = (key: string) => container.querySelector(`[data-sidebar-row-key="${key}"]`)?.className ?? '';
    expect(cls('build')).toMatch(/active/);
    expect(cls('diagnostics')).not.toMatch(/active/);
  });
});
