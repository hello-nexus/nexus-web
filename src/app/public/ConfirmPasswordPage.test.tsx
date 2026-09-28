import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const confirmMock = vi.fn();
vi.mock('../../api/account', () => ({
  confirmPasswordChange: (...args: unknown[]) => confirmMock(...args),
}));

vi.mock('../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { ConfirmPasswordPage } from './ConfirmPasswordPage';

beforeEach(() => {
  confirmMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ConfirmPasswordPage', () => {
  it('shows the invalid state when no token is present, without calling the API', () => {
    render(<ConfirmPasswordPage token="" />);

    expect(screen.getByText('auth.confirmPassword.invalid.title')).toBeInTheDocument();
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it('does not confirm on load, only on the button press', async () => {
    confirmMock.mockResolvedValue('ok');
    render(<ConfirmPasswordPage token="tok" />);

    expect(confirmMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('auth.confirmPassword.action'));

    await waitFor(() => expect(screen.getByText('auth.confirmPassword.success.title')).toBeInTheDocument());
    expect(confirmMock).toHaveBeenCalledWith('tok');
  });

  it('offers a retry, not the invalid state, when the request fails', async () => {
    confirmMock.mockResolvedValueOnce('error').mockResolvedValueOnce('ok');
    render(<ConfirmPasswordPage token="tok" />);

    fireEvent.click(screen.getByText('auth.confirmPassword.action'));
    await waitFor(() => expect(screen.getByText('account.error.generic')).toBeInTheDocument());
    expect(screen.queryByText('auth.confirmPassword.invalid.title')).toBeNull();

    fireEvent.click(screen.getByText('auth.confirmPassword.action'));
    await waitFor(() => expect(screen.getByText('auth.confirmPassword.success.title')).toBeInTheDocument());
  });

  it('shows the invalid state when the API refuses the token', async () => {
    confirmMock.mockResolvedValue('invalid');
    render(<ConfirmPasswordPage token="tok" />);

    fireEvent.click(screen.getByText('auth.confirmPassword.action'));

    await waitFor(() => expect(screen.getByText('auth.confirmPassword.invalid.title')).toBeInTheDocument());
  });
});
