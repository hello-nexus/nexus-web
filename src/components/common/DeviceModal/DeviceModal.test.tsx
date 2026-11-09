import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DeviceModal } from './DeviceModal';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('DeviceModal close affordance', () => {
  it('renders the header X and no footer buttons when no footer props are passed', () => {
    const onClose = vi.fn();
    render(<DeviceModal open onClose={onClose} title="T"><p>body</p></DeviceModal>);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute('aria-label')).toBe('app.window.close');
    fireEvent.click(buttons[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('puts Cancel first and the submit buttons after it, with no X, when a footer is passed', () => {
    render(<DeviceModal open onClose={() => {}} title="T" footer={<button type="button">Save</button>}><p>body</p></DeviceModal>);
    const buttons = screen.getAllByRole('button');
    expect(buttons.map(b => b.textContent)).toEqual(['confirm.cancel', 'Save']);
    expect(screen.queryByLabelText('app.window.close')).toBeNull();
  });

  it('honors a cancelLabel override in footer mode with no X', () => {
    render(<DeviceModal open onClose={() => {}} title="T" cancelLabel="Done"><p>body</p></DeviceModal>);
    expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual(['Done']);
    expect(screen.queryByLabelText('app.window.close')).toBeNull();
  });

  it('renders neither X nor footer when not closable', () => {
    render(<DeviceModal open onClose={() => {}} title="T" closable={false}><p>body</p></DeviceModal>);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
