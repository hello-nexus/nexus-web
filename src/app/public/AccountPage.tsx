import { useEffect } from 'react';
import { Spinner } from '../../components/common/Spinner/Spinner';
import { ToastProvider } from '../../components/common/Toast/Toast';
import { AccountAuthenticationSection } from '../../components/views/SettingsView/Account/AccountAuthenticationSection';
import { AccountDangerZoneSection } from '../../components/views/SettingsView/Account/AccountDangerZoneSection';
import { AccountDevicesSection } from '../../components/views/SettingsView/Account/AccountDevicesSection';
import { directApiBackend } from '../../api/directApiBackend';
import { PublicPageFrame } from './PublicPageFrame';
import { usePublicAccount } from './usePublicAccount';

/**
 * /account - public signed-in account page: Authentication, Devices, and
 * Danger zone (no profile sync - that stays app-only). Redirects to /login
 * when signed out.
 */
export function AccountPage() {
  const { account, refresh } = usePublicAccount();

  useEffect(() => {
    if (account === null) window.location.replace('/login');
  }, [account]);

  if (!account) {
    return (
      <PublicPageFrame>
        <Spinner size={32} />
      </PublicPageFrame>
    );
  }

  const noop = () => {};
  const goToSignIn = () => { window.location.href = '/login'; };
  const goToHome = () => { window.location.href = '/'; };

  return (
    <ToastProvider>
      <PublicPageFrame maxWidth={640}>
        <AccountAuthenticationSection
          backend={directApiBackend}
          account={account}
          onAccountChanged={() => void refresh()}
          recoveryFresh={false}
          onRecoveryFreshConsumed={noop}
        />
        <AccountDevicesSection backend={directApiBackend} />
        <AccountDangerZoneSection
          backend={directApiBackend}
          recoveryFresh={false}
          onRecoveryFreshConsumed={noop}
          onLoggedOut={goToSignIn}
          onDeleted={goToHome}
        />
      </PublicPageFrame>
    </ToastProvider>
  );
}
