import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnifiedDevice } from '../../../hooks/useUnifiedDevices';

// A bulk-pipe LCD that Windows refuses to open reports warning "access-denied";
// its page shows the shared warning notice instead of "Device not connected".

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));
vi.mock('../../common/Toast/Toast', () => ({
  useToast: () => ({ push: vi.fn() }),
}));
vi.mock('../../../hooks/useConflictApps', () => ({
  useConflictApps: () => ({ conflicts: [], ready: true }),
}));

let mockUnified: UnifiedDevice[] = [];
vi.mock('../../../hooks/useUnifiedDevices', async importOriginal => {
  const { useState } = await import('react');
  return {
    ...(await importOriginal<typeof import('../../../hooks/useUnifiedDevices')>()),
    useUnifiedDevices: () => {
      const [on, setOn] = useState(false);
      return {
        unified: mockUnified.map(d => ({ ...d, nexusControlEnabled: d.nexusControlEnabled || on })),
        controlDevice: async () => { setOn(true); },
      };
    },
  };
});

import { DevicePage } from './DevicePage';

function lcd(overrides: Partial<UnifiedDevice> = {}): UnifiedDevice {
  return {
    key: 'curated-thermalright-lcd',
    shortName: 'Thermalright LCD',
    name: 'Thermalright LCD',
    subtitle: 'cooler',
    category: 'cooler',
    iconSrc: '',
    connected: true,
    kind: 'curated',
    curatedId: 'thermalright-lcd',
    navigable: true,
    nexusControlEnabled: true,
    supportsNexusControl: true,
    experimental: false,
    ...overrides,
  };
}

beforeEach(() => { mockUnified = []; });

describe('DevicePage access-denied', () => {
  it('shows the warning notice instead of "not connected"', () => {
    mockUnified = [lcd({ warning: 'access-denied' })];
    render(<DevicePage deviceKey="curated-thermalright-lcd" serviceOnline />);

    expect(screen.getByText('devices.accessDenied.title')).toBeInTheDocument();
    expect(screen.getByText('devices.accessDenied.body')).toBeInTheDocument();
    expect(screen.getByText('Thermalright LCD')).toBeInTheDocument();
    expect(screen.queryByText('devices.page.notConnected')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('data-tone', 'warning');
  });

  it('shows the notice at once after Nexus Control turns on, without the detecting hold', () => {
    mockUnified = [lcd({ nexusControlEnabled: false, warning: 'access-denied' })];
    render(<DevicePage deviceKey="curated-thermalright-lcd" serviceOnline />);

    fireEvent.click(screen.getByRole('switch', { name: 'devices.nexusControl' }));

    expect(screen.getByText('devices.accessDenied.title')).toBeInTheDocument();
    expect(screen.queryByText('devices.nexusControlOff.detecting')).not.toBeInTheDocument();
  });

  it('keeps "not connected" for a panel with no warning', () => {
    mockUnified = [lcd()];
    render(<DevicePage deviceKey="curated-thermalright-lcd" serviceOnline />);

    expect(screen.getByText('devices.page.notConnected')).toBeInTheDocument();
    expect(screen.queryByText('devices.accessDenied.title')).not.toBeInTheDocument();
  });
});
