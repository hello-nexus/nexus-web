import { SignInForm } from '../../components/views/SettingsView/Account/SignInForm';
import { directApiBackend } from '../../api/directApiBackend';
import { PublicAuthGate } from './PublicAuthGate';
import { PublicPageFrame } from './PublicPageFrame';
import { usePublicAccount } from './usePublicAccount';
import { resolvePostAuthPath } from './postAuthRedirect';

/** /login - public sign-in page. Redirects to the signed-in landing page when already signed in. */
export function LoginPage() {
  const { account } = usePublicAccount();

  const goHome = () => { window.location.href = resolvePostAuthPath(); };
  const goToRecover = () => { window.location.href = '/recover'; };
  const goToRegister = () => { window.location.href = '/register'; };

  return (
    <PublicAuthGate account={account}>
      <PublicPageFrame>
        <SignInForm
          backend={directApiBackend}
          onSuccess={goHome}
          onForgotPassword={goToRecover}
          onCreateAccount={goToRegister}
        />
      </PublicPageFrame>
    </PublicAuthGate>
  );
}
