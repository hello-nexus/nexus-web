import { useCallback, useState } from 'react';
import { ToastProvider } from '../../components/common/Toast/Toast';
import { ForgotPasswordFlow } from '../../components/views/SettingsView/Account/ForgotPasswordFlow';
import { AccountAuthenticationSection } from '../../components/views/SettingsView/Account/AccountAuthenticationSection';
import { AccountDangerZoneSection } from '../../components/views/SettingsView/Account/AccountDangerZoneSection';
import { directApiBackend } from '../../api/directApiBackend';
import { PublicPageFrame } from './PublicPageFrame';
import { usePublicAccount } from './usePublicAccount';

/**
 * /recover - public lost-password request+poll flow (device-grant, same
 * mechanism as the in-app flow: grantId+deviceSecret generated in the
 * browser). Distinct from /auth/recover, which is the magic-link landing the
 * email itself points at. Once the poll reports approved, this page renders
 * the Authentication + Danger zone blocks in place (a passwordless,
 * recovery-fresh session), prompting the password-change modal - no
 * redirect, matching the in-app AccountView's same-page transition.
 */
export function ForgotPasswordPage() {
  const { account, refresh } = usePublicAccount();
  const [recoveryFresh, setRecoveryFresh] = useState(false);

  const handleRecoveryApproved = useCallback(() => {
    setRecoveryFresh(true);
    void refresh();
  }, [refresh]);

  const handleRecoveryFreshConsumed = useCallback(() => setRecoveryFresh(false), []);

  const signedIn = recoveryFresh && Boolean(account);
  const goToSignIn = () => { window.location.href = '/login'; };
  const goToHome = () => { window.location.href = '/'; };

  return (
    <ToastProvider>
      <PublicPageFrame maxWidth={signedIn ? 640 : 420}>
        {signedIn && account ? (
          <>
            <AccountAuthenticationSection
              backend={directApiBackend}
              account={account}
              onAccountChanged={() => void refresh()}
              recoveryFresh={recoveryFresh}
              onRecoveryFreshConsumed={handleRecoveryFreshConsumed}
              onLoggedOut={goToSignIn}
            />
            <AccountDangerZoneSection
              backend={directApiBackend}
              recoveryFresh={recoveryFresh}
              onRecoveryFreshConsumed={handleRecoveryFreshConsumed}
              onDeleted={goToHome}
            />
          </>
        ) : (
          <ForgotPasswordFlow
            backend={directApiBackend}
            onBackToSignIn={goToSignIn}
            onRecoveryApproved={handleRecoveryApproved}
          />
        )}
      </PublicPageFrame>
    </ToastProvider>
  );
}
