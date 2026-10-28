import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../common/Toast/Toast';
import { AccountDevicesSection } from './AccountDevicesSection';
import type { AuthBackend } from '../../../../api/authBackend';
import type { SystemSpecs } from '../../../../hooks/useSystemSpecs';
import fullSpecs from '../../../../hooks/__fixtures__/systemSpecs.json';

// Runs the real useSystemSpecs against a recorded-shape /system/specs payload, so a field the service adds
// (hardwareIds is an object, not a string) reaches systemSpecsToDeviceSpecs the way it does in the app.

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const fetchServiceMock = vi.fn();
vi.mock('../../../../api/service', () => ({
  fetchService: (...args: unknown[]) => fetchServiceMock(...args),
  putService: vi.fn(),
}));

function makeBackend(): AuthBackend {
  return {
    login: vi.fn(), register: vi.fn(), logout: vi.fn(), getAccount: vi.fn(), recoveryStart: vi.fn(),
    recoveryStatus: vi.fn(), changePassword: vi.fn(), changeUsername: vi.fn(), setPrivate: vi.fn(),
    deleteAccount: vi.fn(), uploadAvatar: vi.fn(),
    listDevices: vi.fn().mockResolvedValue([]),
    upsertDevice: vi.fn(),
    deleteDevice: vi.fn(),
  };
}

describe('AccountDevicesSection with a full /system/specs payload', () => {
  beforeEach(() => {
    fetchServiceMock.mockReset().mockImplementation(async (path: string) =>
      path === '/system/specs' ? (fullSpecs as SystemSpecs) : null);
  });

  it('renders and prefills a new device from string specs, ignoring the hardwareIds object', async () => {
    render(<ToastProvider><AccountDevicesSection backend={makeBackend()} prefillFromLocalSpecs /></ToastProvider>);

    await waitFor(() => expect(screen.getByText('account.devices.empty')).toBeInTheDocument());
    await waitFor(() => expect(fetchServiceMock).toHaveBeenCalledWith('/system/specs'));
    fireEvent.click(screen.getByRole('button', { name: 'account.devices.add' }));

    await waitFor(() => expect(screen.getByLabelText('devices.specs.row.processor')).toHaveValue('AMD Ryzen 7 9800X3D 8-Core Processor'));
  });
});
