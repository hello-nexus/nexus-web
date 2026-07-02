import { useEffect, type ReactNode } from 'react';
import { Spinner } from '../../components/common/Spinner/Spinner';
import { PublicPageFrame } from './PublicPageFrame';
import type { AuthAccount } from '../../api/authBackend';

interface PublicAuthGateProps {
  account: AuthAccount | null | undefined;
  children: ReactNode;
}

/**
 * Shared by /login and /register: `account` is `undefined` during the
 * initial silent-refresh load. While it is `undefined` or already signed in,
 * this renders a centered spinner and redirects to /account instead of the
 * signed-out form.
 */
export function PublicAuthGate({ account, children }: PublicAuthGateProps) {
  useEffect(() => {
    if (account) window.location.replace('/account');
  }, [account]);

  if (account === undefined || account) {
    return (
      <PublicPageFrame>
        <Spinner size={32} />
      </PublicPageFrame>
    );
  }

  return <>{children}</>;
}
