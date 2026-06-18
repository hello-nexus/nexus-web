import { Smartphone } from 'lucide-react';
import classNames from 'classnames';
import { DeviceModal } from '../components/common/DeviceModal/DeviceModal';
import { HoverTooltip } from '../components/common/HoverTooltip/HoverTooltip';
import { PairRemoteContent, formatConnectedDevices } from '../components/common/PairRemote/PairRemoteContent';
import { useTranslation } from '../lib/i18n';
import styles from '../App.module.scss';

export function PairPhoneButton({ connectedCount, remoteEnabled, disabled, compact, onClick }: {
  connectedCount: number;
  remoteEnabled: boolean;
  disabled: boolean;
  compact: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const connected = connectedCount > 0;
  // When remote is OFF the dot and the connected-count are hidden entirely
  // (nothing can connect), so the dot only ever reflects connected/idle.
  const dotState: 'off' | 'connected' = connected ? 'connected' : 'off';
  const countLabel = remoteEnabled
    ? formatConnectedDevices(connectedCount, t)
    : t('phonePair.killswitch.offLabel');
  const btn = (
    <button
      type="button"
      className={classNames(styles.phonePairBtn, { [styles.phonePairBtnCompact]: compact })}
      onClick={onClick}
      disabled={disabled}
      aria-label={compact ? `${t('phonePair.title')} · ${countLabel}` : undefined}
    >
      <span className={styles.phonePairIcon}>
        <Smartphone size={16} />
        {remoteEnabled && <span className={styles.phonePairDot} data-state={dotState} />}
      </span>
      {!compact && (
        <>
          <span className={styles.phonePairTitle}>{t('phonePair.title')}</span>
          {remoteEnabled && <span className={styles.phonePairState}>{countLabel}</span>}
        </>
      )}
    </button>
  );
  // Only the compact (icon-only) form needs a tooltip; the expanded form
  // already shows the title + state inline.
  return (
    <div className={styles.phonePairWrap}>
      {compact
        ? <HoverTooltip body={`${t('phonePair.title')} · ${countLabel}`}>{btn}</HoverTooltip>
        : btn}
    </div>
  );
}

export function PairPhoneModal({ open, connectedCount, remoteEnabled, onRemoteEnabledChange, onClose }: {
  open: boolean;
  connectedCount: number;
  remoteEnabled: boolean;
  onRemoteEnabledChange: (next: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <DeviceModal open={open} onClose={onClose} title={t('phonePair.title')} icon={<Smartphone size={18} />} wide>
      <PairRemoteContent
        active={open}
        layout="grid"
        connectedCount={connectedCount}
        remoteEnabled={remoteEnabled}
        onRemoteEnabledChange={onRemoteEnabledChange}
      />
    </DeviceModal>
  );
}
