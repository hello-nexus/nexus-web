import { SignInForm } from '../../components/views/SettingsView/Account/SignInForm';
import { directApiBackend } from '../../api/directApiBackend';
import { PublicAuthGate } from './PublicAuthGate';
import { PublicPageFrame } from './PublicPageFrame';
import { usePublicAccount } from './usePublicAccount';

/** /login - public sign-in page. Redirects to /account when already signed in. */
export function LoginPage() {
  const { account } = usePublicAccount();

  // On my.* hosts the root is the dashboard (or the launch/download gate),
  // which is where a fresh sign-in should land. On the bare host the root is
  // the marketing page with no signed-in affordance, so keep /account there.
  const goHome = () => {
    const my = window.location.hostname.toLowerCase().startsWith('my.');
    window.location.href = my ? '/' : '/account';
  };
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
