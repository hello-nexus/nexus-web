import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmModal } from './ConfirmModal';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('ConfirmModal footer layout', () => {
  const base = { open: true, title: 'T', message: 'M', onConfirm: () => {}, onCancel: () => {} };

  it('renders no close X', () => {
    render(<ConfirmModal {...base} />);
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull();
  });

  it('puts Cancel first, then the submit buttons after it', () => {
    render(<ConfirmModal {...base} confirmLabel="Confirm" primaryAction={{ label: 'Primary', onSelect: () => {} }} />);
    const labels = screen.getAllByRole('button').map(b => b.textContent);
    expect(labels).toEqual(['confirm.cancel', 'Confirm', 'Primary']);
  });
});
