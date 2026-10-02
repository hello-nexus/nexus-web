import { useEffect, useState } from 'react';
import { UserRound } from 'lucide-react';
import { DeviceModal } from '../../../common/DeviceModal/DeviceModal';
import { AccountSignedOut, type AccountSignedOutSubtab } from './AccountSignedOut';
import { localServiceBackend } from '../../../../api/localServiceBackend';
import { useTranslation } from '../../../../lib/i18n';
import styles from './Account.module.scss';

interface AccountSignInModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** The line under the title on the sign-in screen; defaults to the generic account pitch. */
  body?: string;
  /** Fired once a session exists: sign-in submit, the register flow's retry, or an approved recovery. */
  onSignedIn: () => void;
}

/** The in-app sign-in, register and recover flows in a dialog over whichever page asked for an account. */
export function AccountSignInModal({ open, onClose, title, body, onSignedIn }: AccountSignInModalProps) {
  const { t } = useTranslation();
  const [subtab, setSubtab] = useState<AccountSignedOutSubtab>('login');

  // The dialog stays mounted between openings, so every opening starts on sign-in.
  useEffect(() => {
    if (!open) setSubtab('login');
  }, [open]);

  return (
    <DeviceModal open={open} onClose={onClose} title={title} icon={<UserRound size={18} />}>
      <div className={styles.embedded}>
        {subtab === 'login' && <p className={styles.subtitle}>{body ?? t('account.signIn.subtitle')}</p>}
        <AccountSignedOut
          backend={localServiceBackend}
          subtab={subtab}
          onSubtabChange={setSubtab}
          onRecoveryApproved={onSignedIn}
          onSignedIn={onSignedIn}
          embedded
        />
      </div>
    </DeviceModal>
  );
}
