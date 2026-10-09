import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NexusControlOff } from './DevicePage';

/* eslint-disable @typescript-eslint/no-explicit-any */

const h = vi.hoisted(() => ({
  conflicts: [] as any[],
  ready: true,
  updateChannel: 'production',
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));

vi.mock('../../../hooks/useConflictApps', () => ({
  useConflictApps: () => ({ conflicts: h.conflicts, ready: h.ready }),
}));

vi.mock('../../../hooks/useUiSettings', () => ({
  useUiSettings: () => ({ settings: { updateChannel: h.updateChannel } }),
}));

const mockSavePreferences = vi.fn();
const mockCheckForUpdate = vi.fn();

vi.mock('../../../api/profiles', () => ({
  savePreferences: (...args: any[]) => mockSavePreferences(...args),
}));

vi.mock('../../../api/update', () => ({
  checkForUpdate: (...args: any[]) => mockCheckForUpdate(...args),
}));

const mockKillConflict = vi.fn();

vi.mock('../../../api/conflicts', () => ({
  killConflict: (...args: any[]) => mockKillConflict(...args),
}));

beforeEach(() => {
  h.conflicts = [];
  h.ready = true;
  h.updateChannel = 'production';
  mockKillConflict.mockReset();
  mockSavePreferences.mockReset().mockResolvedValue({ success: true });
  mockCheckForUpdate.mockReset().mockResolvedValue(null);
});

describe('NexusControlOff', () => {
  it('renders the device name as the title and the enable toggle when no conflict is active', () => {
    const onEnable = vi.fn();
    render(<NexusControlOff deviceName="Corsair iCUE LINK Hub" conflictAppId="icue" onEnable={onEnable} />);

    expect(screen.getByText('Corsair iCUE LINK Hub')).toBeInTheDocument();
    expect(screen.getByText('devices.nexusControlOff.enableHint')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'conflicts.modal.endTask' })).not.toBeInTheDocument();

    const toggle = screen.getByRole('switch', { name: 'devices.nexusControl' });
    expect(toggle).not.toBeDisabled();
    fireEvent.click(toggle);
    expect(onEnable).toHaveBeenCalledTimes(1);
  });

  it('renders the ConflictAppCard (name + PID + End Task) and a disabled Nexus Control switch when the conflicting app is running', () => {
    h.conflicts = [{ id: 'icue', displayName: 'iCUE', category: 'cooling', processName: 'iCUE.exe', pid: 42 }];
    const onEnable = vi.fn();
    render(<NexusControlOff deviceName="Corsair iCUE LINK Hub" conflictAppId="icue" onEnable={onEnable} />);

    expect(screen.getByText('devices.nexusControlOff.conflictHint:{"app":"iCUE"}')).toBeInTheDocument();

    // ConflictAppCard row: display name and PID.
    expect(screen.getByText('iCUE')).toBeInTheDocument();
    expect(screen.getByText('conflicts.modal.pid:{"pid":42}')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'conflicts.modal.endTask' })).toBeInTheDocument();

    const toggle = screen.getByRole('switch', { name: 'devices.nexusControl' });
    expect(toggle).toBeDisabled();
    fireEvent.click(toggle);
    expect(onEnable).not.toHaveBeenCalled();
  });

  it('ignores a conflict list entry that does not match conflictAppId', () => {
    h.conflicts = [{ id: 'lian-li-l-connect', displayName: 'L-Connect', category: 'lighting', processName: 'LConnect.exe', pid: 7 }];
    render(<NexusControlOff deviceName="Corsair iCUE LINK Hub" conflictAppId="icue" onEnable={vi.fn()} />);

    expect(screen.getByText('devices.nexusControlOff.enableHint')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'conflicts.modal.endTask' })).not.toBeInTheDocument();
  });

  it('disables the enable toggle while the conflict snapshot is still resolving', () => {
    h.ready = false;
    const onEnable = vi.fn();
    render(<NexusControlOff deviceName="Corsair iCUE LINK Hub" conflictAppId="icue" onEnable={onEnable} />);

    const toggle = screen.getByRole('switch', { name: 'devices.nexusControl' });
    expect(toggle).toBeDisabled();
    fireEvent.click(toggle);
    expect(onEnable).not.toHaveBeenCalled();
  });

  it('offers the beta channel in place of the switch for a device that requires a beta build', async () => {
    render(<NexusControlOff deviceName="Lian Li Uni Hub" experimental requiresBeta onEnable={vi.fn()} />);

    expect(screen.getByText('devices.requiresBeta.notice')).toBeInTheDocument();
    expect(screen.queryByText('devices.nexusControlOff.enableHint')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'devices.nexusControl' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'devices.requiresBeta.switch' }));
    await waitFor(() => expect(mockCheckForUpdate).toHaveBeenCalledTimes(1));
    expect(mockSavePreferences).toHaveBeenCalledWith({ update: { updateChannel: 'beta' } });
  });

  it('drops the switch-to-beta button once the update channel is already beta', () => {
    h.updateChannel = 'beta';
    render(<NexusControlOff deviceName="Lian Li Uni Hub" requiresBeta onEnable={vi.fn()} />);

    expect(screen.getByText('devices.requiresBeta.onBeta')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'devices.requiresBeta.switch' })).not.toBeInTheDocument();
  });

  it('shows the experimental badge under the switch only for experimental devices', () => {
    const { rerender } = render(<NexusControlOff deviceName="Lian Li Uni Hub" experimental onEnable={vi.fn()} />);
    expect(screen.getByText('devices.experimental.badge')).toBeInTheDocument();

    rerender(<NexusControlOff deviceName="HYTE NP50" experimental={false} onEnable={vi.fn()} />);
    expect(screen.queryByText('devices.experimental.badge')).not.toBeInTheDocument();
  });

  it('does not gate the enable toggle on readiness for a device with no possible conflict', () => {
    h.ready = false;
    const onEnable = vi.fn();
    render(<NexusControlOff deviceName="Lian Li Uni Hub" conflictAppId={undefined} onEnable={onEnable} />);

    const toggle = screen.getByRole('switch', { name: 'devices.nexusControl' });
    expect(toggle).not.toBeDisabled();
    fireEvent.click(toggle);
    expect(onEnable).toHaveBeenCalledTimes(1);
  });
});
