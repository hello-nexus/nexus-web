import { useEffect, useId, useRef, useState } from 'react';
import { Sun } from 'lucide-react';
import { minuteOfDay } from '../../../lib/brightnessSchedule';
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
  /**
   * One line about the schedule at a minute of the local day; null while it is
   * off. `sliderValue` is the control's own slider, which a device is capped
   * under; lighting passes it too but is shown the schedule's level.
   */
  statusAt: (minute: number, sliderValue: number | null) => string | null;
  /** The popover opened: a chance to refresh what it shows. */
  onOpen?: () => void;
  /**
   * The schedule's level capping this control right now (it wears the lower of
   * its slider and this); null while the schedule is off or this control does
   * not follow it.
   */
  capPercent: number | null;
}

interface BrightnessScheduleButtonProps {
  binding: BrightnessScheduleBinding;
  /** The slider this sun sits on, for the status line's "Now". */
  sliderValue?: number | null;
}

// The status line is recomputed from the curve this often while the popover is open.
const STATUS_TICK_MS = 15_000;

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
export function BrightnessScheduleButton({ binding, sliderValue = null }: BrightnessScheduleButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const following = binding.scheduleOn && binding.follows;
  const [now, setNow] = useState(() => new Date());
  const { onOpen } = binding;
  useEffect(() => {
    if (!open) return undefined;
    setNow(new Date());
    onOpen?.();
    const timer = window.setInterval(() => setNow(new Date()), STATUS_TICK_MS);
    return () => window.clearInterval(timer);
  }, [open, onOpen]);
  const toggle = () => setOpen(o => !o);
  const statusLine = open ? binding.statusAt(minuteOfDay(now), sliderValue) : null;
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
          statusLine && <p className={styles.note}>{statusLine}</p>
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

/**
 * What a brightness slider shows for the schedule it follows: the sun in its
 * label row, and a caret at the level the schedule caps it at (the fill past
 * it dimmed when it is the lower of the two) with a hover explaining it.
 * Spread `marker`, `fillCap` and `markerTooltip` onto the Slider and render
 * `sun` in its label row; one implementation for every slider.
 */
export function useScheduleSliderProps(binding: BrightnessScheduleBinding | undefined, value: number) {
  const { t } = useTranslation();
  if (!binding) return { sun: null, marker: undefined, fillCap: undefined, markerTooltip: undefined };
  const cap = binding.capPercent;
  return {
    sun: <BrightnessScheduleButton binding={binding} sliderValue={value} />,
    marker: cap ?? undefined,
    fillCap: cap !== null && cap < value ? cap : undefined,
    markerTooltip: cap !== null ? t('lighting.schedule.marker.capped', { level: cap }) : undefined,
  };
}
