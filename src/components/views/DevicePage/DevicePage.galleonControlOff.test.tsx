import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnifiedDevice } from '../../../hooks/useUnifiedDevices';

const toastPushMock = vi.fn();

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));
vi.mock('../../common/Toast/Toast', () => ({
  useToast: () => ({ push: toastPushMock }),
}));
vi.mock('../../../hooks/useConflictApps', () => ({
  useConflictApps: () => ({ conflicts: [], ready: true }),
}));
vi.mock('../../../api/displays', () => ({ promoteDisplayToPanel: vi.fn() }));
vi.mock('./GalleonKeyboardLightingSection', () => ({
  GalleonKeyboardLightingSection: ({ serial, className }: { serial?: string; className?: string }) => (
    <div data-testid="galleon-section" data-serial={serial} className={className} />
  ),
}));
vi.mock('./PanelDevicePage', () => ({
  PanelDevicePage: () => <div data-testid="panel-device-page" />,
}));

let mockUnified: UnifiedDevice[] = [];
vi.mock('../../../hooks/useUnifiedDevices', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../hooks/useUnifiedDevices')>()),
  useUnifiedDevices: () => ({ unified: mockUnified, controlDevice: vi.fn() }),
}));

import { DevicePage } from './DevicePage';

function deck(overrides: Partial<UnifiedDevice> = {}): UnifiedDevice {
  return {
    key: 'streamdeck:EA3DCFA2B70CBA',
    shortName: 'Galleon 100 SD',
    name: 'Galleon 100 SD',
    subtitle: 'controller',
    category: 'controller',
    iconSrc: '/assets/devices/corsair.svg',
    connected: true,
    kind: 'curated',
    curatedId: 'streamdeck',
    streamdeckSerial: 'EA3DCFA2B70CBA',
    navigable: true,
    nexusControlEnabled: false,
    supportsNexusControl: true,
    experimental: false,
    ...overrides,
  };
}

beforeEach(() => {
  toastPushMock.mockReset();
  mockUnified = [];
});

describe('DevicePage Stream Deck control off', () => {
  it('keeps the keyboard lighting section above the re-enable switch', () => {
    mockUnified = [deck()];
    render(<DevicePage deviceKey="streamdeck:EA3DCFA2B70CBA" serviceOnline />);

    const section = screen.getByTestId('galleon-section');
    expect(section.getAttribute('data-serial')).toBe('EA3DCFA2B70CBA');
    expect(screen.getByText('devices.nexusControlOff.enableHint')).toBeInTheDocument();
  });

  it('adds nothing for a curated device other than the Stream Deck', () => {
    mockUnified = [deck({ key: 'curated-tryx', curatedId: 'tryx', streamdeckSerial: undefined })];
    render(<DevicePage deviceKey="curated-tryx" serviceOnline />);

    expect(screen.queryByTestId('galleon-section')).toBeNull();
  });
});
