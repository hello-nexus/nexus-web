import { type KeyboardEvent, type PointerEvent, type ReactNode, useEffect, useRef } from 'react';
import { HoverTooltip } from '../../../components/common/HoverTooltip/HoverTooltip';
import styles from './PanelMixerSlider.module.scss';

// How far a press on the icon may drift and still be a tap.
const ICON_TAP_SLOP_PX = 12;

export interface PanelMixerSliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  topLabel?: string;
  label?: string;
  valueLabel?: string;
  /** Ordinal badge rendered inside the top of the track, mirroring the bottom icon. */
  indexBadge?: string;
  /** Render `valueLabel` in the badge slot. A fader whose number is aria-only
   *  leaves the operator guessing at everything but the fill height. */
  showValue?: boolean;
  /** Live signal level 0-1, drawn inside the fill. Omit for a plain fader. */
  meter?: number;
  icon?: ReactNode;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
  onInteractionStart?: () => void;
  // The drag ended while the slider was disabled, so no commit follows; lets a consumer close its drag bookkeeping.
  onDragEnd?: () => void;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  iconButton?: {
    ariaLabel: string;
    ariaPressed?: boolean;
    active?: boolean;
    onClick: () => void;
  };
}

export function PanelMixerSlider({
  value,
  min = 0,
  max = 100,
  step = 1,
  topLabel,
  label,
  valueLabel,
  indexBadge,
  showValue = false,
  meter,
  icon,
  ariaLabel,
  disabled = false,
  className,
  onInteractionStart,
  onDragEnd,
  onChange,
  onCommit,
  iconButton,
}: PanelMixerSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const iconTapHandledRef = useRef(false);
  const iconTapTimerRef = useRef<number | null>(null);
  const iconPressRef = useRef<{ id: number; x: number; y: number } | null>(null);
  useEffect(() => () => { if (iconTapTimerRef.current) window.clearTimeout(iconTapTimerRef.current); }, []);
  // Last value handed to onChange, seeded by the press. A cancel commits this so
  // a consumer's drag bookkeeping always closes, and never a value recomputed
  // from the cancel event, whose coordinates are not a finger position.
  const lastEmittedRef = useRef(0);
  const clampedValue = clamp(value, min, max);
  const pct = max === min ? 0 : (clampedValue - min) / (max - min);

  const valueFromY = (clientY: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.height <= 0) return clampedValue;
    const ratio = 1 - (clientY - rect.top) / rect.height;
    return quantize(min + ratio * (max - min), min, max, step);
  };

  const startInteraction = () => {
    if (disabled) return;
    onInteractionStart?.();
  };

  const updateValue = (next: number) => {
    if (disabled) return;
    onChange(next);
  };

  const commitValue = (next: number) => {
    if (disabled) return;
    onCommit?.(next);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = true;
    startInteraction();
    const first = valueFromY(event.clientY);
    lastEmittedRef.current = first;
    updateValue(first);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || disabled) return;
    event.preventDefault();
    event.stopPropagation();
    const next = valueFromY(event.clientY);
    lastEmittedRef.current = next;
    updateValue(next);
  };

  const handleLostPointerCapture = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (disabled) onDragEnd?.();
    else onCommit?.(lastEmittedRef.current);
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    draggingRef.current = false;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The browser may release capture first when a touch is cancelled.
    }
    if (disabled) {
      onDragEnd?.();
      return;
    }
    if (event.type === 'pointercancel') {
      commitValue(lastEmittedRef.current);
      return;
    }
    commitValue(valueFromY(event.clientY));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        next = clampedValue + step;
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        next = clampedValue - step;
        break;
      case 'PageUp':
        next = clampedValue + step * 10;
        break;
      case 'PageDown':
        next = clampedValue - step * 10;
        break;
      case 'Home':
        next = min;
        break;
      case 'End':
        next = max;
        break;
      default:
        return;
    }
    event.preventDefault();
    startInteraction();
    const committed = quantize(next, min, max, step);
    updateValue(committed);
    commitValue(committed);
  };

  const formattedValue = valueLabel ?? `${Math.round(clampedValue)}`;
  const labelText = topLabel ?? label;
  const iconNode = icon && iconButton ? (
    <button
      type="button"
      className={styles.iconButton}
      data-active={iconButton.active ? 'true' : 'false'}
      aria-label={iconButton.ariaLabel}
      aria-pressed={iconButton.ariaPressed}
      disabled={disabled}
      onPointerDown={(event) => {
        event.stopPropagation();
        // A new press ends the previous tap's click suppression.
        iconTapHandledRef.current = false;
        if (iconTapTimerRef.current) { window.clearTimeout(iconTapTimerRef.current); iconTapTimerRef.current = null; }
        iconPressRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
      }}
      // Acts on the release: a tap that follows a scroll fling loses its click. The release
      // must belong to this button's own press: same pointer, barely moved. A drag released
      // over the icon, a press that began elsewhere, or a cancelled touch is not a tap. The
      // click that follows any matched release is ignored.
      onPointerCancel={() => { iconPressRef.current = null; }}
      onPointerUp={(event) => {
        const press = iconPressRef.current;
        iconPressRef.current = null;
        if (disabled || !press || press.id !== event.pointerId) return;
        // A release that matched its press owns the click the browser synthesizes from it,
        // whether it was accepted as a tap or rejected as a drag: that click must not act.
        iconTapHandledRef.current = true;
        if (iconTapTimerRef.current) window.clearTimeout(iconTapTimerRef.current);
        iconTapTimerRef.current = window.setTimeout(() => { iconTapHandledRef.current = false; }, 400);
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > ICON_TAP_SLOP_PX) return;
        event.stopPropagation();
        iconButton.onClick();
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (iconTapHandledRef.current) { iconTapHandledRef.current = false; return; }
        iconButton.onClick();
      }}
    >
      {icon}
    </button>
  ) : (
    icon && <div className={styles.icon} aria-hidden="true">{icon}</div>
  );

  return (
    <div
      className={`${styles.root} ${className ?? ''}`}
      data-disabled={disabled ? 'true' : 'false'}
      data-panel-scrollable="true"
    >
      <div
        className={styles.hitbox}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onLostPointerCapture={handleLostPointerCapture}
      >
        <div
          ref={trackRef}
          className={styles.track}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-orientation="vertical"
          aria-label={ariaLabel}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={Math.round(clampedValue)}
          aria-valuetext={formattedValue}
          aria-disabled={disabled || undefined}
          onKeyDown={handleKeyDown}
        >
          {/* The fill clips a second copy of the icon drawn in the on-accent
              foreground. Both copies sit at the same offset from the track's
              bottom edge, which the fill shares, so the copy lines up exactly
              and is revealed as the fill rises past the glyph. */}
          <div className={styles.fill} style={{ height: `${pct * 100}%` }} aria-hidden="true" data-skin-part="bar-fill">
            {icon && (
              <div
                className={styles.iconOnFill}
                data-active={iconButton?.active ? 'true' : 'false'}
              >
                {icon}
              </div>
            )}
          </div>
          {/* Clamped to the fill: a session meter can read louder than the
              fader depending on where the driver taps it, and a bar sticking
              out above the fill would read as a value, not as signal. */}
          {meter !== undefined && (
            <div
              className={styles.meter}
              style={{ height: `${Math.min(clamp(meter, 0, 1), pct) * 100}%` }}
              aria-hidden="true"
            />
          )}
          {(indexBadge || showValue) && (
            <div className={styles.indexBadge} aria-hidden="true">{indexBadge ?? formattedValue}</div>
          )}
          {iconNode}
        </div>
      </div>
      {/* Tooltip restores the full label when ellipsis-truncated in a
          too-narrow cell. */}
      {labelText && (
        <HoverTooltip body={labelText} side="top">
          <div className={styles.label}>{labelText}</div>
        </HoverTooltip>
      )}
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function quantize(value: number, min: number, max: number, step: number): number {
  const safeStep = step > 0 ? step : 1;
  const clamped = clamp(value, min, max);
  const snapped = Math.round((clamped - min) / safeStep) * safeStep + min;
  const decimals = decimalPlaces(safeStep);
  return Number(clamp(snapped, min, max).toFixed(decimals));
}

function decimalPlaces(value: number): number {
  const match = value.toString().match(/\.(\d+)/);
  return match ? match[1].length : 0;
}
