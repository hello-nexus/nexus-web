import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictAppCard } from './ConflictAppCard';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockKillConflict = vi.fn();

const mockDisableAutostart = vi.fn();

vi.mock('../../../api/conflicts', () => ({
  killConflict: (...args: any[]) => mockKillConflict(...args),
  disableConflictAutostart: (...args: any[]) => mockDisableAutostart(...args),
}));

beforeEach(() => {
  mockKillConflict.mockReset();
  mockDisableAutostart.mockReset();
});

const conflict = { id: 'icue', displayName: 'iCUE', category: 'cooling', processName: 'iCUE.exe', pid: 4212 };

describe('ConflictAppCard', () => {
  it('renders the display name, translated category, process name, PID, and an End Task button', () => {
    render(<ConflictAppCard conflict={conflict} />);

    expect(screen.getByText('iCUE')).toBeInTheDocument();
    expect(screen.getByText('conflicts.category.cooling')).toBeInTheDocument();
    expect(screen.getByText('iCUE.exe')).toBeInTheDocument();
    expect(screen.getByText('PID 4212')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'conflicts.modal.endTask' })).toBeInTheDocument();
  });

  it('falls back to the raw category when it has no matching locale key', () => {
    render(<ConflictAppCard conflict={{ ...conflict, category: 'unknown-category' }} />);

    expect(screen.getByText('unknown-category')).toBeInTheDocument();
  });

  it('offers no startup control when no entry resolved', () => {
    render(<ConflictAppCard conflict={conflict} autostart={[]} />);

    expect(screen.queryByText('conflicts.modal.removeStartup')).not.toBeInTheDocument();
    expect(screen.queryByText('conflicts.modal.removeStartupService')).not.toBeInTheDocument();
  });

  it('offers one startup control for an app holding several entries', () => {
    render(<ConflictAppCard
      conflict={conflict}
      autostart={[
        { kind: 'service', entryName: 'CorsairDeviceListerService' },
        { kind: 'runKeyMachine', entryName: 'Corsair iCUE5 Software' },
      ]}
    />);

    expect(screen.getByRole('button', { name: 'conflicts.modal.removeStartup' })).toBeInTheDocument();
    expect(mockDisableAutostart).not.toHaveBeenCalled();
  });

  it('wires the End Task button to kill this conflict by id', async () => {
    mockKillConflict.mockResolvedValue({ killed: true });
    render(<ConflictAppCard conflict={conflict} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'conflicts.modal.endTask' }));
    });

    expect(mockKillConflict).toHaveBeenCalledWith('icue');
  });
});
