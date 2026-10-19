import { render, screen } from '@testing-library/react';
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
vi.mock('../../../hooks/useUnifiedDevices', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../hooks/useUnifiedDevices')>()),
  useUnifiedDevices: () => ({ unified: mockUnified, controlDevice: vi.fn() }),
}));

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

  it('keeps "not connected" for a panel with no warning', () => {
    mockUnified = [lcd()];
    render(<DevicePage deviceKey="curated-thermalright-lcd" serviceOnline />);

    expect(screen.getByText('devices.page.notConnected')).toBeInTheDocument();
    expect(screen.queryByText('devices.accessDenied.title')).not.toBeInTheDocument();
  });
});
