import { RegisterFlow } from '../../components/views/SettingsView/Account/RegisterFlow';
import { directApiBackend } from '../../api/directApiBackend';
import { PublicAuthGate } from './PublicAuthGate';
import { PublicPageFrame } from './PublicPageFrame';
import { usePublicAccount } from './usePublicAccount';

/** /register - public account creation page. Redirects to /account when already signed in. */
export function RegisterPage() {
  const { account } = usePublicAccount();

  const goToSignIn = () => { window.location.href = '/login'; };
  const goToAccount = () => { window.location.href = '/account'; };

  return (
    <PublicAuthGate account={account}>
      <PublicPageFrame>
        <RegisterFlow backend={directApiBackend} onBackToSignIn={goToSignIn} onSignedIn={goToAccount} />
      </PublicPageFrame>
    </PublicAuthGate>
  );
}
