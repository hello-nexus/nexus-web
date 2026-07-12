import { RegisterFlow } from '../../components/views/SettingsView/Account/RegisterFlow';
import { directApiBackend } from '../../api/directApiBackend';
import { PublicAuthGate } from './PublicAuthGate';
import { PublicPageFrame } from './PublicPageFrame';
import { usePublicAccount } from './usePublicAccount';
import { resolvePostAuthPath } from './postAuthRedirect';

/** /register - public account creation page. Redirects to the signed-in landing page when already signed in. */
export function RegisterPage() {
  const { account } = usePublicAccount();

  const goToSignIn = () => { window.location.href = '/login'; };
  const goHome = () => { window.location.href = resolvePostAuthPath(); };

  return (
    <PublicAuthGate account={account}>
      <PublicPageFrame>
        <RegisterFlow backend={directApiBackend} onBackToSignIn={goToSignIn} onSignedIn={goHome} />
      </PublicPageFrame>
    </PublicAuthGate>
  );
}
