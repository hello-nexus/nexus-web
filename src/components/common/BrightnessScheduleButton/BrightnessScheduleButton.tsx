import { Sun } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import styles from './BrightnessScheduleButton.module.scss';

interface BrightnessScheduleButtonProps {
  /** Accented: the schedule is on and this control follows it. */
  active: boolean;
  /** False while the schedule has not loaded; the button then does nothing. */
  canOpen: boolean;
  onOpen: () => void;
  /** Tooltip body; the tooltip title is the shared "Brightness settings". */
  status?: string;
}

/**
 * The sun button shared by every brightness control (master brightness, panel
 * and display sliders). One schedule drives them all, so each opens the same
 * brightness settings.
 *
 * A span with the button role, not a <button>, so it can sit inside a slider's
 * label row without taking the label's clicks.
 */
export function BrightnessScheduleButton({ active, canOpen, onOpen, status }: BrightnessScheduleButtonProps) {
  const { t } = useTranslation();
  const open = () => { if (canOpen) onOpen(); };
  return (
    <HoverTooltip
      title={status !== undefined ? t('lighting.schedule.marker.title') : undefined}
      body={status ?? t('lighting.schedule.marker.title')}
      side="top"
    >
      <span
        role="button"
        tabIndex={canOpen ? 0 : -1}
        className={styles.button}
        data-active={active ? '' : undefined}
        aria-label={t('lighting.schedule.marker.title')}
        aria-disabled={canOpen ? undefined : true}
        // A mouse press must not focus the sun button: the modal hands focus back
        // to it on close, and that focus reopens the tooltip.
        onMouseDown={e => e.preventDefault()}
        onClick={e => { e.preventDefault(); open(); }}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
      >
        <Sun size={14} />
      </span>
    </HoverTooltip>
  );
}
