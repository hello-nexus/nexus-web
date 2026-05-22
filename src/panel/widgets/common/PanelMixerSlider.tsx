import { type KeyboardEvent, type PointerEvent, type ReactNode, useRef } from 'react';
import { HoverTooltip } from '../../../components/common/HoverTooltip/HoverTooltip';
import styles from './PanelMixerSlider.module.scss';

export interface PanelMixerSliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  topLabel?: string;
  label?: string;
  valueLabel?: string;
  icon?: ReactNode;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
  onInteractionStart?: () => void;
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
  icon,
  ariaLabel,
  disabled = false,
  className,
  onInteractionStart,
  onChange,
  onCommit,
  iconButton,
}: PanelMixerSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const segmentCount = 10;
  const clampedValue = clamp(value, min, max);
  const pct = max === min ? 0 : (clampedValue - min) / (max - min);
  const filledSegments = clampedValue <= min ? 0 : Math.max(1, Math.ceil(pct * segmentCount));
  const segmentNodes = Array.from({ length: segmentCount }, (_, i) => {
    const active = i >= segmentCount - filledSegments;
    return <span key={i} className={styles.segment} data-active={active ? 'true' : 'false'} />;
  });

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
    updateValue(valueFromY(event.clientY));
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || disabled) return;
    event.preventDefault();
    event.stopPropagation();
    updateValue(valueFromY(event.clientY));
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || disabled) return;
    event.preventDefault();
    event.stopPropagation();
    draggingRef.current = false;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The browser may release capture first when a touch is cancelled.
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
      }}
      onClick={(event) => {
        event.stopPropagation();
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
      {/* Wrapped so the label's overflow-ellipsis truncation isn't silent —
          hover restores the full string when the cell is too narrow. */}
      {labelText && (
        <HoverTooltip body={labelText} side="top">
          <div className={styles.label}>{labelText}</div>
        </HoverTooltip>
      )}
      <div
        className={styles.hitbox}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <div className={styles.frame}>
          <div className={styles.value}>{formattedValue}</div>
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
            <div className={styles.segments} aria-hidden="true">
              {segmentNodes}
            </div>
          </div>
          {iconNode}
        </div>
      </div>
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
