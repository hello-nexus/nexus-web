import { useCallback } from 'react';
import { useToast } from '../components/common/Toast/Toast';
import { useTopicCallback } from '../hooks/useMultiplexSocket';
import { useTranslation } from '../lib/i18n';
import { openTransferInbox, TRANSFER_TOPIC, type TransferFrame } from '../api/transfer';

// Desktop-dashboard listener for phone → PC transfers. Mounted at the layout
// root (next to IncomingPairModal) so the toast surfaces regardless of the
// open view; the phone panel (PanelEntrypoint) never mounts it.
export function TransferToasts() {
  const { t } = useTranslation();
  const { push } = useToast();

  const handleFrame = useCallback((raw: unknown) => {
    const frame = raw as TransferFrame | null;
    if (!frame || (frame.kind !== 'file' && frame.kind !== 'clipboard')) return;
    const from = frame.from || t('transfer.fromPhone');
    if (frame.kind === 'clipboard') {
      push({
        title: t('transfer.toast.clipboardTitle', { from }),
        body: t('transfer.toast.clipboardBody'),
      });
      return;
    }
    push({
      title: t('transfer.toast.fileTitle', { name: frame.name, from }),
      body: t('transfer.toast.savedTo', { inbox: frame.inbox }),
      action: frame.inbox
        ? { label: t('transfer.toast.openFolder'), onClick: () => { void openTransferInbox(frame.inbox); } }
        : undefined,
    });
  }, [push, t]);

  useTopicCallback(TRANSFER_TOPIC, true, handleFrame);

  return null;
}
