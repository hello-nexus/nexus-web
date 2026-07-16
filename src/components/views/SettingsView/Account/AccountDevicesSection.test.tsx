import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../common/Toast/Toast';
import { AccountDevicesSection } from './AccountDevicesSection';
import type { AccountDeviceItem, AuthBackend } from '../../../../api/authBackend';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      let text = key;
      if (params) for (const [k, v] of Object.entries(params)) text += ` ${k}=${v}`;
      return text;
    },
  }),
}));

function makeBackend(overrides: Partial<AuthBackend> = {}): AuthBackend {
  return {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    getAccount: vi.fn(),
    recoveryStart: vi.fn(),
    recoveryStatus: vi.fn(),
    changePassword: vi.fn(),
    changeUsername: vi.fn(),
    setPrivate: vi.fn(),
    deleteAccount: vi.fn(),
    uploadAvatar: vi.fn(),
    ...overrides,
  };
}

function mkDevice(overrides: Partial<AccountDeviceItem> = {}): AccountDeviceItem {
  return {
    installId: 'manual-abc123',
    hostname: 'Battlestation',
    specs: { processor: 'Ryzen 9 9800X3D' },
    manual: true,
    lastSeenAt: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

function renderSection(backend: AuthBackend) {
  return render(<ToastProvider><AccountDevicesSection backend={backend} /></ToastProvider>);
}

describe('AccountDevicesSection', () => {
  it('renders nothing for a backend without device support', () => {
    const { container } = renderSection(makeBackend());
    expect(container).toBeEmptyDOMElement();
  });

  it('lists devices and shows Edit only for manual entries', async () => {
    const listDevices = vi.fn().mockResolvedValue([
      mkDevice({ installId: 'manual-1', hostname: 'Battlestation', manual: true }),
      mkDevice({ installId: 'auto-1', hostname: 'DESKTOP-AUTO', manual: false }),
    ]);
    renderSection(makeBackend({ listDevices, upsertDevice: vi.fn(), deleteDevice: vi.fn() }));

    await waitFor(() => expect(screen.getByText('Battlestation')).toBeInTheDocument());
    expect(screen.getByText('DESKTOP-AUTO')).toBeInTheDocument();

    // Only the manual entry gets an Edit action; both get Remove.
    expect(screen.getAllByRole('button', { name: 'account.devices.edit' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'account.devices.remove' })).toHaveLength(2);
    expect(screen.getByText('account.devices.manual.badge')).toBeInTheDocument();
    expect(screen.getByText('account.devices.auto.badge')).toBeInTheDocument();
  });

  it('shows an empty state when the account has no devices', async () => {
    const listDevices = vi.fn().mockResolvedValue([]);
    renderSection(makeBackend({ listDevices, upsertDevice: vi.fn() }));

    await waitFor(() => expect(screen.getByText('account.devices.empty')).toBeInTheDocument());
  });

  it('adds a manual device and shows it in the list without a refetch', async () => {
    const listDevices = vi.fn().mockResolvedValue([]);
    const saved = mkDevice({ installId: 'manual-new', hostname: 'New Rig' });
    const upsertDevice = vi.fn().mockResolvedValue({ status: 200, body: { error: false, ...saved } });
    renderSection(makeBackend({ listDevices, upsertDevice, deleteDevice: vi.fn() }));

    await waitFor(() => expect(screen.getByText('account.devices.empty')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'account.devices.add' }));
    fireEvent.input(screen.getByLabelText('account.devices.modal.nameLabel'), { target: { value: 'New Rig' } });
    fireEvent.click(screen.getByRole('button', { name: 'account.save' }));

    await waitFor(() => expect(upsertDevice).toHaveBeenCalledTimes(1));
    expect(upsertDevice).toHaveBeenCalledWith(expect.stringMatching(/^manual-[0-9a-f]{32}$/), expect.objectContaining({
      hostname: 'New Rig', manual: true,
    }));
    await waitFor(() => expect(screen.getByText('New Rig')).toBeInTheDocument());
  });

  it('surfaces the device-cap error inline without closing the modal', async () => {
    const listDevices = vi.fn().mockResolvedValue([]);
    const upsertDevice = vi.fn().mockResolvedValue({ status: 400, body: { error: true, msg: 'device_limit_reached' } });
    renderSection(makeBackend({ listDevices, upsertDevice }));

    await waitFor(() => expect(screen.getByText('account.devices.empty')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'account.devices.add' }));
    fireEvent.input(screen.getByLabelText('account.devices.modal.nameLabel'), { target: { value: 'New Rig' } });
    fireEvent.click(screen.getByRole('button', { name: 'account.save' }));

    await waitFor(() => expect(screen.getByText(/account\.devices\.error\.cap/)).toBeInTheDocument());
    expect(screen.getByLabelText('account.devices.modal.nameLabel')).toBeInTheDocument();
  });

  it('removes a device after confirming the delete dialog', async () => {
    const device = mkDevice();
    const listDevices = vi.fn().mockResolvedValue([device]);
    const deleteDevice = vi.fn().mockResolvedValue(true);
    renderSection(makeBackend({ listDevices, upsertDevice: vi.fn(), deleteDevice }));

    await waitFor(() => expect(screen.getByText('Battlestation')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'account.devices.remove' }));
    expect(screen.getByText('account.devices.remove.confirmTitle')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'account.devices.remove' })[1]);

    await waitFor(() => expect(deleteDevice).toHaveBeenCalledWith('manual-abc123'));
    await waitFor(() => expect(screen.queryByText('Battlestation')).not.toBeInTheDocument());
  });
});
