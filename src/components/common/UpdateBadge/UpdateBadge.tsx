import classNames from 'classnames';
import { Download } from 'lucide-react';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import { useTranslation } from '../../../lib/i18n';
import styles from './UpdateBadge.module.scss';

interface UpdateBadgeProps {
  updateMode?: string;
  compact: boolean;
  onOpen: () => void;
  onInstall: () => void;
}

export function UpdateBadge({ updateMode, compact, onOpen, onInstall }: UpdateBadgeProps) {
  const { t } = useTranslation();

  const isNotify = updateMode === 'notify';
  const label = isNotify ? t('update.badge.label') : t('update.badge.labelReady');
  const handleClick = isNotify ? onOpen : onInstall;

  const badgeBtn = (
    <button
      type="button"
      className={classNames(styles.badge, { [styles.badgeCompact]: compact })}
      onClick={handleClick}
      aria-label={label}
    >
      <span className={styles.icon}>
        <Download size={14} />
      </span>
      {!compact && (
        <span className={styles.text}>{label}</span>
      )}
    </button>
  );

  return (
    <div className={classNames(styles.wrap, { [styles.wrapCompact]: compact })}>
      {compact ? <HoverTooltip body={label} side="right">{badgeBtn}</HoverTooltip> : badgeBtn}
    </div>
  );
}
