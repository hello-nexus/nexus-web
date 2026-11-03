import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DeviceModal } from './DeviceModal';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('DeviceModal footer layout', () => {
  it('renders no header X and a single Close button when there is nothing to submit', () => {
    const onClose = vi.fn();
    render(<DeviceModal open onClose={onClose} title="T"><p>body</p></DeviceModal>);
    const buttons = screen.getAllByRole('button');
    expect(buttons.map(b => b.textContent)).toEqual(['app.window.close']);
    fireEvent.click(buttons[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('puts Cancel first and the submit buttons after it', () => {
    render(<DeviceModal open onClose={() => {}} title="T" footer={<button type="button">Save</button>}><p>body</p></DeviceModal>);
    expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual(['confirm.cancel', 'Save']);
  });

  it('honours a cancelLabel override', () => {
    render(<DeviceModal open onClose={() => {}} title="T" cancelLabel="Done"><p>body</p></DeviceModal>);
    expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual(['Done']);
  });

  it('hides the footer when not closable', () => {
    render(<DeviceModal open onClose={() => {}} title="T" closable={false}><p>body</p></DeviceModal>);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
