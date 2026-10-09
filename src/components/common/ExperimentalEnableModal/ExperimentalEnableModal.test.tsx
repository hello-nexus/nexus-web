import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExperimentalEnableModal } from './ExperimentalEnableModal';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('ExperimentalEnableModal', () => {
  it('repeats the Experimental badge copy with the confirm label', () => {
    render(<ExperimentalEnableModal open onConfirm={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText('devices.experimental.tooltip.title')).toBeInTheDocument();
    expect(screen.getByText('devices.experimental.tooltip.body')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'devices.experimental.confirm' })).toBeInTheDocument();
  });

  it('confirms and cancels through its buttons', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ExperimentalEnableModal open onConfirm={onConfirm} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: 'devices.experimental.confirm' }));
    fireEvent.click(screen.getByRole('button', { name: 'confirm.cancel' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders nothing while closed', () => {
    render(<ExperimentalEnableModal open={false} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByText('devices.experimental.tooltip.title')).not.toBeInTheDocument();
  });
});
