import type { ReactNode } from 'react';
import classNames from 'classnames';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import styles from './TopBarStatusButton.module.scss';

interface TopBarStatusButtonProps {
  icon: ReactNode;
  /** Semantic tint: 'warn' (amber) for conflicts, 'good' (green) for updates. */
  tone: 'warn' | 'good';
  /** Tooltip body and accessible label. Drives the hover text, so it should
   *  describe what clicking does (e.g. "Install update" vs "Update available"). */
  label: string;
  onClick: () => void;
}

/**
 * Tinted icon-only alert button for the top bar's right cluster (app-conflict /
 * update-available). Shares the bar's icon-button footprint but stays coloured
 * in its tone at rest to flag the active state; hover washes the same tone
 * behind it, and the label shows as a bottom tooltip.
 */
export function TopBarStatusButton({ icon, tone, label, onClick }: TopBarStatusButtonProps) {
  return (
    <HoverTooltip body={label} side="bottom">
      <button
        type="button"
        className={classNames(styles.button, styles[tone])}
        onClick={onClick}
        aria-label={label}
      >
        {icon}
      </button>
    </HoverTooltip>
  );
}
