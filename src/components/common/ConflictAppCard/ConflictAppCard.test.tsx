import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictAppCard, selectedOwner } from './ConflictAppCard';
import type { ConflictDevice } from '../../../hooks/useConflictDevices';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      (params ? `${key}:${Object.values(params).join('|')}` : key),
  }),
}));

const mockKillConflict = vi.fn();

vi.mock('../../../api/conflicts', () => ({
  killConflict: (...args: any[]) => mockKillConflict(...args),
}));

beforeEach(() => {
  mockKillConflict.mockReset();
});

const conflict = { id: 'icue', displayName: 'iCUE', category: 'cooling', processName: 'iCUE.exe', pid: 4212 };

describe('ConflictAppCard', () => {
  it('renders the display name, executable, PID, and an End Task button', () => {
    render(<ConflictAppCard conflict={conflict} />);

    expect(screen.getByText('iCUE')).toBeInTheDocument();
    expect(screen.getByText('iCUE.exe')).toBeInTheDocument();
    expect(screen.getByText('conflicts.modal.pid:4212')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'conflicts.modal.endTask' })).toBeInTheDocument();
  });

  it('never shows a category', () => {
    // The catalog's guess at what an app drives is often wrong, so the row
    // stays to what the user can verify: the executable and its PID.
    render(<ConflictAppCard conflict={{ ...conflict, category: 'cooling' }} />);

    expect(screen.queryByText(/cooling/i)).not.toBeInTheDocument();
  });



  it('wires the End Task button to kill this conflict by id', async () => {
    mockKillConflict.mockResolvedValue({ killed: true });
    render(<ConflictAppCard conflict={conflict} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'conflicts.modal.endTask' }));
    });

    expect(mockKillConflict).toHaveBeenCalledWith('icue');
  });

  it('renders no device section without devices or a setter', () => {
    render(<ConflictAppCard conflict={conflict} devices={[]} onSetOwner={vi.fn()} />);
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();

    render(<ConflictAppCard conflict={conflict} devices={[{ key: 'k', name: 'Hub', owner: 'nexus' }]} />);
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('lists the devices with who drives each and preselects the agreed owner', () => {
    const devices: ConflictDevice[] = [
      { key: 'device:corsair', name: 'iCUE LINK Hub', owner: 'app' },
      { key: 'lighting:openrgb-1', name: 'Vengeance RAM', owner: 'app' },
    ];
    render(<ConflictAppCard conflict={conflict} devices={devices} onSetOwner={vi.fn()} />);

    expect(screen.getByText('iCUE LINK Hub')).toBeInTheDocument();
    expect(screen.getByText('Vengeance RAM')).toBeInTheDocument();
    // Both rows show the app as the owner (the app's display name, not a key).
    expect(screen.getAllByText('iCUE')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'conflicts.devices.appControls:iCUE' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'conflicts.devices.nexusControls' })).not.toBeChecked();
  });

  it('preselects nothing while the devices disagree', () => {
    const devices: ConflictDevice[] = [
      { key: 'a', name: 'Hub', owner: 'nexus' },
      { key: 'b', name: 'RAM', owner: 'mixed' },
    ];
    render(<ConflictAppCard conflict={conflict} devices={devices} onSetOwner={vi.fn()} />);

    expect(screen.getByText('brand')).toBeInTheDocument();
    expect(screen.getByText('conflicts.devices.mixed')).toBeInTheDocument();
    for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked();
  });

  it('hands the devices to Nexus and then ends the app', async () => {
    const calls: string[] = [];
    const onSetOwner = vi.fn(async (owner: string) => { calls.push(`owner:${owner}`); });
    mockKillConflict.mockImplementation(async () => { calls.push('kill'); return { killed: true }; });
    const devices: ConflictDevice[] = [{ key: 'a', name: 'Hub', owner: 'app' }];
    render(<ConflictAppCard conflict={conflict} devices={devices} onSetOwner={onSetOwner} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'conflicts.devices.nexusControls' }));
    });

    expect(calls).toEqual(['owner:nexus', 'kill']);
    expect(mockKillConflict).toHaveBeenCalledWith('icue');
  });

  it('says so when Nexus took the devices but the app would not end', async () => {
    mockKillConflict.mockResolvedValue({ killed: false });
    const devices: ConflictDevice[] = [{ key: 'a', name: 'Hub', owner: 'app' }];
    render(<ConflictAppCard conflict={conflict} devices={devices} onSetOwner={vi.fn(async () => {})} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'conflicts.devices.nexusControls' }));
    });

    expect(screen.getByRole('alert')).toHaveTextContent('conflicts.devices.endFailed:iCUE');
  });

  it('keeps the devices but drops the owner switch once the app is terminated', () => {
    const devices: ConflictDevice[] = [
      { key: 'a', name: 'iCUE LINK Hub', owner: 'nexus' },
      { key: 'b', name: 'Vengeance RAM', owner: 'nexus' },
    ];
    render(<ConflictAppCard conflict={conflict} devices={devices} onSetOwner={vi.fn()} terminated />);

    expect(screen.getByText('iCUE LINK Hub')).toBeInTheDocument();
    expect(screen.getByText('Vengeance RAM')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'conflicts.modal.endTask' })).not.toBeInTheDocument();
    expect(screen.getByText('conflicts.modal.terminated')).toBeInTheDocument();
  });

  it('reports the kill from the owner switch so the row can go terminated', async () => {
    mockKillConflict.mockResolvedValue({ killed: true });
    const onTerminated = vi.fn();
    const devices: ConflictDevice[] = [{ key: 'a', name: 'Hub', owner: 'app' }];
    render(
      <ConflictAppCard
        conflict={conflict}
        devices={devices}
        onSetOwner={vi.fn(async () => {})}
        onTerminated={onTerminated}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'conflicts.devices.nexusControls' }));
    });

    expect(onTerminated).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('hands the devices to the app without ending it', async () => {
    const onSetOwner = vi.fn(async () => {});
    const devices: ConflictDevice[] = [{ key: 'a', name: 'Hub', owner: 'nexus' }];
    render(<ConflictAppCard conflict={conflict} devices={devices} onSetOwner={onSetOwner} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'conflicts.devices.appControls:iCUE' }));
    });

    expect(onSetOwner).toHaveBeenCalledWith('app');
    expect(mockKillConflict).not.toHaveBeenCalled();
  });

  it('never spins End task for the app choice, which ends nothing', async () => {
    const endTask = () => screen.getByRole('button', { name: 'conflicts.modal.endTask' });
    // Held open so the button can be read mid-flight.
    let release = () => {};
    const onSetOwner = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
    const devices: ConflictDevice[] = [{ key: 'a', name: 'Hub', owner: 'nexus' }];
    render(<ConflictAppCard conflict={conflict} devices={devices} onSetOwner={onSetOwner} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'conflicts.devices.appControls:iCUE' }));
    });
    expect(endTask()).not.toHaveAttribute('data-loading', 'true');

    await act(async () => { release(); });
    expect(endTask()).not.toHaveAttribute('data-loading', 'true');
  });

  it('spins End task while the Nexus choice runs, since that one ends the app', async () => {
    let release = () => {};
    const onSetOwner = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
    mockKillConflict.mockResolvedValue({ killed: true });
    const devices: ConflictDevice[] = [{ key: 'a', name: 'Hub', owner: 'app' }];
    render(<ConflictAppCard conflict={conflict} devices={devices} onSetOwner={onSetOwner} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'conflicts.devices.nexusControls' }));
    });
    expect(screen.getByRole('button', { name: 'conflicts.modal.endTask' })).toHaveAttribute('data-loading', 'true');

    await act(async () => { release(); });
  });

  it('ignores a click on the owner already selected', async () => {
    const onSetOwner = vi.fn(async () => {});
    const devices: ConflictDevice[] = [{ key: 'a', name: 'Hub', owner: 'nexus' }];
    render(<ConflictAppCard conflict={conflict} devices={devices} onSetOwner={onSetOwner} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'conflicts.devices.nexusControls' }));
    });

    expect(onSetOwner).not.toHaveBeenCalled();
    expect(mockKillConflict).not.toHaveBeenCalled();
  });
});

describe('selectedOwner', () => {
  it('agrees only when every device has the same owner', () => {
    expect(selectedOwner([])).toBe('');
    expect(selectedOwner([{ key: 'a', name: 'a', owner: 'nexus' }, { key: 'b', name: 'b', owner: 'nexus' }])).toBe('nexus');
    expect(selectedOwner([{ key: 'a', name: 'a', owner: 'app' }])).toBe('app');
    expect(selectedOwner([{ key: 'a', name: 'a', owner: 'app' }, { key: 'b', name: 'b', owner: 'nexus' }])).toBe('');
    expect(selectedOwner([{ key: 'a', name: 'a', owner: 'mixed' }])).toBe('');
  });
});

describe('ConflictAppCard auto start', () => {
  const entry = { kind: 'runKeyMachine', entryName: 'Corsair iCUE5 Software' };

  it('offers nothing when the service reported no recipe for the app', () => {
    render(<ConflictAppCard conflict={conflict} onDisableAutostart={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'conflicts.modal.disableAutostart' })).not.toBeInTheDocument();
  });

  it('offers nothing when the app has a recipe but nothing starts it at boot', () => {
    render(<ConflictAppCard conflict={conflict} autostart={[]} onDisableAutostart={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'conflicts.modal.disableAutostart' })).not.toBeInTheDocument();
  });

  it('offers the action under End task while an entry is live', () => {
    render(<ConflictAppCard conflict={conflict} autostart={[entry]} onDisableAutostart={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveTextContent('conflicts.modal.endTask');
    expect(buttons[1]).toHaveTextContent('conflicts.modal.disableAutostart');
  });

  it('names what will be turned off, rather than claiming the app auto-starts', () => {
    render(
      <ConflictAppCard
        conflict={conflict}
        autostart={[entry, { kind: 'service', entryName: 'CAMService' }]}
        onDisableAutostart={vi.fn()}
      />,
    );

    expect(screen.getByText('conflicts.modal.autostartTargetStartup:Corsair iCUE5 Software')).toBeInTheDocument();
    expect(screen.getByText('conflicts.modal.autostartTargetService:CAMService')).toBeInTheDocument();
  });

  it('keeps the action on a terminated row - ending the task does not stop the next boot', () => {
    render(<ConflictAppCard conflict={conflict} autostart={[entry]} onDisableAutostart={vi.fn()} terminated />);
    expect(screen.queryByRole('button', { name: 'conflicts.modal.endTask' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'conflicts.modal.disableAutostart' })).toBeInTheDocument();
  });

  it('confirms once the entry list comes back empty', async () => {
    const onDisable = vi.fn().mockResolvedValue(true);
    const { rerender } = render(
      <ConflictAppCard conflict={conflict} autostart={[entry]} onDisableAutostart={onDisable} />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'conflicts.modal.disableAutostart' }));
    });
    expect(onDisable).toHaveBeenCalledTimes(1);

    // The parent re-reads after the write; the confirmation replaces the
    // button only once the service says nothing starts the app any more.
    rerender(<ConflictAppCard conflict={conflict} autostart={[]} onDisableAutostart={onDisable} />);
    expect(screen.getByText('conflicts.modal.autostartDisabled')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'conflicts.modal.disableAutostart' })).not.toBeInTheDocument();
  });

  it('keeps the confirmation once the ended app drops out of the read entirely', async () => {
    const onDisable = vi.fn().mockResolvedValue(true);
    const { rerender } = render(
      <ConflictAppCard conflict={conflict} autostart={[entry]} onDisableAutostart={onDisable} />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'conflicts.modal.disableAutostart' }));
    });

    // The service lists only detected apps; a terminated one vanishes from
    // the next read rather than coming back empty.
    rerender(<ConflictAppCard conflict={conflict} onDisableAutostart={onDisable} terminated />);
    expect(screen.getByText('conflicts.modal.autostartDisabled')).toBeInTheDocument();
  });

  it('confirms from the surface when a resolve-all verified the entries off', () => {
    render(<ConflictAppCard conflict={conflict} autostart={[]} onDisableAutostart={vi.fn()} autostartDisabled />);
    expect(screen.getByText('conflicts.modal.autostartDisabled')).toBeInTheDocument();
  });

  it('reports a partial or failed disable and leaves the button up', async () => {
    const onDisable = vi.fn().mockResolvedValue(false);
    render(<ConflictAppCard conflict={conflict} autostart={[entry]} onDisableAutostart={onDisable} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'conflicts.modal.disableAutostart' }));
    });

    expect(screen.getByRole('alert')).toHaveTextContent('conflicts.modal.autostartFailed:iCUE');
    expect(screen.getByRole('button', { name: 'conflicts.modal.disableAutostart' })).toBeInTheDocument();
  });
});
