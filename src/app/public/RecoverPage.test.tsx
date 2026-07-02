import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const completeRecoveryMock = vi.fn();
vi.mock('../../api/account', () => ({
  completeRecovery: (...args: unknown[]) => completeRecoveryMock(...args),
}));

vi.mock('../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      let text = key;
      if (params) for (const [k, v] of Object.entries(params)) text += ` ${k}=${v}`;
      return text;
    },
  }),
}));

import { RecoverPage } from './RecoverPage';

beforeEach(() => {
  completeRecoveryMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('RecoverPage', () => {
  it('shows the invalid state immediately when no token is present, without calling the API', () => {
    render(<RecoverPage token="" />);

    expect(screen.getByText('auth.recover.invalid.title')).toBeInTheDocument();
    expect(completeRecoveryMock).not.toHaveBeenCalled();
  });

  it('shows the success state with the returned username interpolated', async () => {
    completeRecoveryMock.mockResolvedValue({ ok: true, username: 'Nova' });
    render(<RecoverPage token="tok" />);

    await waitFor(() => expect(screen.getByText('auth.recover.success.title')).toBeInTheDocument());
    expect(screen.getByText('auth.recover.success.body username=Nova')).toBeInTheDocument();
  });

  it('shows the invalid state when the server reports ok: false', async () => {
    completeRecoveryMock.mockResolvedValue({ ok: false });
    render(<RecoverPage token="tok" />);

    await waitFor(() => expect(screen.getByText('auth.recover.invalid.title')).toBeInTheDocument());
  });

  it('treats an ok: true response missing a username as invalid', async () => {
    completeRecoveryMock.mockResolvedValue({ ok: true });
    render(<RecoverPage token="tok" />);

    await waitFor(() => expect(screen.getByText('auth.recover.invalid.title')).toBeInTheDocument());
  });
});
