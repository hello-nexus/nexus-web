import { useId, useRef, useState } from 'react';
import { Sun } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { Button } from '../Button/Button';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import { Popover } from '../Popover/Popover';
import { Toggle } from '../Toggle/Toggle';
import styles from './BrightnessScheduleButton.module.scss';

/** How one brightness control binds to the one universal schedule. */
export interface BrightnessScheduleBinding {
  scheduleOn: boolean;
  /** Whether this control follows the schedule; only meaningful while it is on. */
  follows: boolean;
  onFollowsChange: (next: boolean) => void;
  /** Turns the master schedule on. */
  onTurnOn: () => void;
  /** Opens the full schedule editor. */
  onEdit: () => void;
  /** One line about the schedule right now; null while it is off. */
  statusLine: string | null;
}

interface BrightnessScheduleButtonProps {
  binding: BrightnessScheduleBinding;
}

/**
 * The sun button shared by every brightness control (master brightness, panel
 * and display sliders). One schedule drives them all, so each opens the same
 * small popover: this control's follow switch, the schedule's status, and a way
 * into the full editor. Accented while the schedule is on and this control
 * follows it.
 *
 * A span with the button role, not a <button>, so it can sit inside a slider's
 * label row without taking the label's clicks.
 */
export function BrightnessScheduleButton({ binding }: BrightnessScheduleButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const following = binding.scheduleOn && binding.follows;
  const toggle = () => setOpen(o => !o);
  return (
    <span ref={anchorRef} style={{ display: 'inline-flex' }}>
      <HoverTooltip
        body={following ? t('lighting.schedule.follow.following') : t('lighting.schedule.follow.notFollowing')}
        side="top"
      >
        <span
          role="button"
          tabIndex={0}
          className={styles.button}
          data-active={following ? '' : undefined}
          aria-label={t('lighting.schedule.marker.title')}
          aria-haspopup="dialog"
          aria-expanded={open}
          // A mouse press must not focus the sun: the popover hands focus back
          // to it on close, and that focus reopens the tooltip.
          onMouseDown={e => e.preventDefault()}
          onClick={e => { e.preventDefault(); toggle(); }}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
        >
          <Sun size={14} />
        </span>
      </HoverTooltip>
      <Popover
        portal
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        placement="bottom-start"
        className={styles.popover}
        ariaLabel={t('lighting.schedule.marker.title')}
      >
        <div className={styles.followRow}>
          <span id={labelId}>{t('lighting.schedule.follow.label')}</span>
          <Toggle
            checked={following}
            disabled={!binding.scheduleOn}
            ariaLabelledBy={labelId}
            onChange={binding.onFollowsChange}
          />
        </div>
        {binding.scheduleOn ? (
          binding.statusLine && <p className={styles.note}>{binding.statusLine}</p>
        ) : (
          <p className={styles.note}>{t('lighting.schedule.now.off')}</p>
        )}
        <div className={styles.actions}>
          {!binding.scheduleOn && (
            <Button type="button" size="sm" onClick={binding.onTurnOn}>{t('lighting.schedule.follow.turnOn')}</Button>
          )}
          <Button type="button" size="sm" tone="ghost" onClick={() => { setOpen(false); binding.onEdit(); }}>
            {t('lighting.schedule.follow.edit')}
          </Button>
        </div>
      </Popover>
    </span>
  );
}
