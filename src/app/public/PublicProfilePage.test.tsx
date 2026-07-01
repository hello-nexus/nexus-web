import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getPublicAccountMock = vi.fn();
vi.mock('../../api/account', () => ({
  getPublicAccount: (...args: unknown[]) => getPublicAccountMock(...args),
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

import { PublicProfilePage } from './PublicProfilePage';

beforeEach(() => {
  getPublicAccountMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('PublicProfilePage', () => {
  it('renders the not-found state', async () => {
    getPublicAccountMock.mockResolvedValue({ status: 'not-found' });
    render(<PublicProfilePage username="ghost" />);

    await waitFor(() => expect(screen.getByText('publicProfile.notFound.title')).toBeInTheDocument());
  });

  it('renders the private state with the canonical username', async () => {
    getPublicAccountMock.mockResolvedValue({
      status: 'ok',
      account: { username: 'Nova', avatar: null, isPrivate: true },
    });
    render(<PublicProfilePage username="nova" />);

    await waitFor(() => expect(screen.getByText('publicProfile.private.title')).toBeInTheDocument());
    expect(screen.getByText('Nova')).toBeInTheDocument();
  });

  it('renders devices with their spec rows for a public account', async () => {
    getPublicAccountMock.mockResolvedValue({
      status: 'ok',
      account: {
        username: 'Nova',
        avatar: null,
        isPrivate: false,
        createdAt: '2026-01-01T00:00:00Z',
        devices: [
          { hostname: 'DESKTOP-NOVA', specs: { pcName: 'NOVA-PC', processor: 'Ryzen 9 9800X3D' }, lastSeenAt: '2026-06-01T00:00:00Z' },
        ],
      },
    });
    render(<PublicProfilePage username="nova" />);

    await waitFor(() => expect(screen.getByText('DESKTOP-NOVA')).toBeInTheDocument());
    expect(screen.getByText('Ryzen 9 9800X3D')).toBeInTheDocument();
  });

  it('renders the empty-devices state when the account has no machines', async () => {
    getPublicAccountMock.mockResolvedValue({
      status: 'ok',
      account: { username: 'Nova', avatar: null, isPrivate: false, createdAt: '2026-01-01T00:00:00Z', devices: [] },
    });
    render(<PublicProfilePage username="nova" />);

    await waitFor(() => expect(screen.getByText('publicProfile.devices.empty')).toBeInTheDocument());
  });

  it('shows a retry action on error and re-fetches on click', async () => {
    getPublicAccountMock.mockResolvedValueOnce({ status: 'error' });
    render(<PublicProfilePage username="nova" />);

    await waitFor(() => expect(screen.getByText('publicProfile.error.title')).toBeInTheDocument());

    getPublicAccountMock.mockResolvedValueOnce({
      status: 'ok',
      account: { username: 'Nova', avatar: null, isPrivate: true },
    });
    fireEvent.click(screen.getByText('publicProfile.error.retry'));

    await waitFor(() => expect(screen.getByText('publicProfile.private.title')).toBeInTheDocument());
    expect(getPublicAccountMock).toHaveBeenCalledTimes(2);
  });
});
