import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthAccount } from '../../api/authBackend';

const getAccount = vi.fn<() => Promise<AuthAccount | null>>();
vi.mock('../../api/directApiBackend', () => ({ directApiBackend: { getAccount: () => getAccount() } }));

const ACCOUNT: AuthAccount = {
  accountId: 'a1', email: 'g@example.com', username: 'geretti', avatar: null, isPrivate: false, emailVerified: true,
};

// Module state is the point under test, so each case gets a fresh module.
async function freshHook() {
  vi.resetModules();
  return (await import('./usePublicAccount')).usePublicAccount;
}

describe('usePublicAccount', () => {
  beforeEach(() => {
    getAccount.mockReset();
  });

  it('loads once for every caller on the page', async () => {
    getAccount.mockResolvedValue(null);
    const usePublicAccount = await freshHook();
    function Probe({ label }: { label: string }) {
      const { account } = usePublicAccount();
      return <span>{label}:{account === undefined ? 'loading' : account ? account.username : 'signed-out'}</span>;
    }
    render(<><Probe label="header" /><Probe label="page" /></>);

    await waitFor(() => expect(screen.getByText('header:signed-out')).toBeInTheDocument());
    expect(screen.getByText('page:signed-out')).toBeInTheDocument();
    expect(getAccount).toHaveBeenCalledTimes(1);
  });

  it('a refresh through one caller signs every caller in', async () => {
    getAccount.mockResolvedValueOnce(null).mockResolvedValue(ACCOUNT);
    const usePublicAccount = await freshHook();
    function Header() {
      const { account } = usePublicAccount();
      return <span>header:{account ? account.username : 'signed-out'}</span>;
    }
    function Page() {
      const { refresh } = usePublicAccount();
      return <button type="button" onClick={() => void refresh()}>refresh</button>;
    }
    render(<><Header /><Page /></>);
    await waitFor(() => expect(screen.getByText('header:signed-out')).toBeInTheDocument());

    fireEvent.click(screen.getByText('refresh'));

    await waitFor(() => expect(screen.getByText('header:geretti')).toBeInTheDocument());
  });

  it('a view mounting later re-checks a signed-out result, but reuses a signed-in one', async () => {
    getAccount.mockResolvedValueOnce(null).mockResolvedValueOnce(ACCOUNT);
    const usePublicAccount = await freshHook();
    function Probe({ label }: { label: string }) {
      const { account } = usePublicAccount();
      return <span>{label}:{account ? account.username : String(account)}</span>;
    }
    const { rerender } = render(<Probe label="first" />);
    await waitFor(() => expect(screen.getByText('first:null')).toBeInTheDocument());

    rerender(<><Probe label="first" /><Probe label="second" /></>);
    await waitFor(() => expect(screen.getByText('second:geretti')).toBeInTheDocument());
    expect(screen.getByText('first:geretti')).toBeInTheDocument();

    rerender(<><Probe label="first" /><Probe label="second" /><Probe label="third" /></>);
    expect(screen.getByText('third:geretti')).toBeInTheDocument();
    expect(getAccount).toHaveBeenCalledTimes(2);
  });

  it('an older load that settles last does not overwrite a newer one', async () => {
    let finishFirst: (a: AuthAccount | null) => void = () => {};
    getAccount
      .mockReturnValueOnce(new Promise((resolve) => { finishFirst = resolve; }))
      .mockResolvedValueOnce(ACCOUNT);
    const usePublicAccount = await freshHook();
    function Probe() {
      const { account, refresh } = usePublicAccount();
      return <button type="button" onClick={() => void refresh()}>{account ? account.username : String(account)}</button>;
    }
    render(<Probe />);

    fireEvent.click(screen.getByText('undefined'));
    await waitFor(() => expect(screen.getByText('geretti')).toBeInTheDocument());
    await act(async () => { finishFirst(null); });

    expect(screen.getByText('geretti')).toBeInTheDocument();
  });
});
