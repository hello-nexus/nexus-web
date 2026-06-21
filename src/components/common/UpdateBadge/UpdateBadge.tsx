import classNames from 'classnames';
import { Download } from 'lucide-react';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import { useTranslation } from '../../../lib/i18n';
import styles from './UpdateBadge.module.scss';

interface UpdateBadgeProps {
  updateAvailable: boolean;
  updateReady: boolean;
  updateMode?: string;
  compact: boolean;
  onOpen: () => void;
}

export function UpdateBadge({ updateAvailable, updateReady, updateMode, compact, onOpen }: UpdateBadgeProps) {
  const { t } = useTranslation();

  if (!updateAvailable) return null;

  const label = updateMode === 'always'
    ? t('update.badge.labelAlways')
    : updateReady ? t('update.badge.labelReady') : t('update.badge.label');

  const badgeBtn = (
    <button
      type="button"
      className={classNames(styles.badge, { [styles.badgeCompact]: compact })}
      onClick={onOpen}
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
