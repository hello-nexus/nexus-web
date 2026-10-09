import { useEffect, useState } from 'react';
import { GitBranch, RefreshCw } from 'lucide-react';
import { DeviceModal } from '../DeviceModal/DeviceModal';
import { Button } from '../Button/Button';
import { UpdateModal } from '../UpdateModal/UpdateModal';
import { getChannelTarget, type ChannelTarget, type UpdateChannel } from '../../../api/update';
import { useTranslation } from '../../../lib/i18n';
import { manualDownloadUrl, previewState } from './channelSwitchState';
import styles from './ChannelSwitchModal.module.scss';

interface ChannelSwitchModalProps {
  open: boolean;
  channel: UpdateChannel;
  onClose: () => void;
}

// Confirms a switch of update channel, then hands the install to the update
// modal in switch mode, which cannot be dismissed until it fails for good.
export function ChannelSwitchModal({ open, channel, onClose }: ChannelSwitchModalProps) {
  const { t } = useTranslation();
  // null while loading, undefined when the lookup got no answer.
  const [target, setTarget] = useState<ChannelTarget | null | undefined>(null);
  const [attempt, setAttempt] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setRunning(false);
    setTarget(null);
    getChannelTarget(channel).then(res => {
      if (!cancelled) setTarget(res ?? undefined);
    });
    return () => { cancelled = true; };
  }, [open, channel, attempt]);

  const state = previewState(target);
  const channelLabel = t(channel === 'beta' ? 'settings.updates.channel.beta' : 'settings.updates.channel.production');
  const title = t(channel === 'beta' ? 'update.switch.titleBeta' : 'update.switch.titleProduction');

  if (running && target) {
    return (
      <UpdateModal
        open={open}
        onClose={onClose}
        status={null}
        autoCheck={false}
        startedInstall
        channelSwitch={{ channel, version: target.version }}
      />
    );
  }

  const openDownload = () => {
    if (target) window.open(manualDownloadUrl(target), '_blank', 'noopener,noreferrer');
  };

  return (
    <DeviceModal open={open} onClose={onClose} title={title} icon={<GitBranch size={18} />} fit>
      <div className={styles.modal}>
        {state === 'loading' && (
          <div className={styles.centered} role="status">
            <RefreshCw size={28} className={styles.spinIcon} />
            <span>{t('update.switch.loading')}</span>
          </div>
        )}

        {state === 'failed' && (
          <>
            <p className={styles.error}>{t('update.switch.loadFailed', { channel: channelLabel })}</p>
            <div className={styles.buttons}>
              <Button tone="neutral" size="md" onClick={onClose}>{t('update.modal.close')}</Button>
              <Button tone="accent" size="md" onClick={() => setAttempt(a => a + 1)}>{t('update.switch.tryAgain')}</Button>
            </div>
          </>
        )}

        {state === 'noRelease' && (
          <>
            <p className={styles.text}>{t('update.switch.noRelease', { channel: channelLabel })}</p>
            <div className={styles.buttons}>
              <Button tone="neutral" size="md" onClick={onClose}>{t('update.modal.close')}</Button>
            </div>
          </>
        )}

        {state === 'manual' && target && (
          <>
            <p className={styles.text}>{t('update.switch.manual', { version: target.version })}</p>
            <div className={styles.buttons}>
              <Button tone="neutral" size="md" onClick={onClose}>{t('update.modal.close')}</Button>
              <Button tone="accent" size="md" onClick={openDownload}>{t('update.modal.download')}</Button>
            </div>
          </>
        )}

        {state === 'ready' && target && (
          <>
            <p className={styles.text}>{t('update.switch.body', { version: target.version })}</p>
            <p className={styles.note}>{t(channel === 'beta' ? 'update.switch.noteBeta' : 'update.switch.noteProduction')}</p>
            <div className={styles.buttons}>
              <Button tone="neutral" size="md" onClick={onClose}>{t('confirm.cancel')}</Button>
              <Button tone="accent" size="md" onClick={() => setRunning(true)}>
                {t('update.switch.install', { version: target.version })}
              </Button>
            </div>
          </>
        )}
      </div>
    </DeviceModal>
  );
}
