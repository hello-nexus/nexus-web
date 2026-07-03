import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const verifyEmailMock = vi.fn();
vi.mock('../../api/account', () => ({
  verifyEmail: (...args: unknown[]) => verifyEmailMock(...args),
}));

vi.mock('../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { VerifyEmailPage } from './VerifyEmailPage';

beforeEach(() => {
  verifyEmailMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('VerifyEmailPage', () => {
  it('shows the invalid state immediately when no token is present, without calling the API', () => {
    render(<VerifyEmailPage token="" />);

    expect(screen.getByText('auth.verify.invalid.title')).toBeInTheDocument();
    expect(verifyEmailMock).not.toHaveBeenCalled();
  });

  it('shows the success state once verification resolves ok', async () => {
    verifyEmailMock.mockResolvedValue({ ok: true });
    render(<VerifyEmailPage token="tok" />);

    await waitFor(() => expect(screen.getByText('auth.verify.success.title')).toBeInTheDocument());
    expect(screen.getByText('common.backToNexus')).toBeInTheDocument();
  });

  it('shows the already-verified state when a re-clicked link resolves ok', async () => {
    verifyEmailMock.mockResolvedValue({ ok: true, alreadyVerified: true });
    render(<VerifyEmailPage token="tok" />);

    await waitFor(() => expect(screen.getByText('auth.verify.alreadyVerified.title')).toBeInTheDocument());
    expect(screen.queryByText('auth.verify.success.title')).not.toBeInTheDocument();
  });

  it('shows the invalid state on failure', async () => {
    verifyEmailMock.mockResolvedValue({ ok: false });
    render(<VerifyEmailPage token="tok" />);

    await waitFor(() => expect(screen.getByText('auth.verify.invalid.title')).toBeInTheDocument());
  });
});
