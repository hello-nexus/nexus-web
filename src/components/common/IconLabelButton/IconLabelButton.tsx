import { useEffect, useRef, type ReactNode } from 'react';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import styles from './IconLabelButton.module.scss';

export interface IconLabelButtonProps {
  label?: ReactNode;
  icon?: ReactNode;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  title?: string;
  ariaLabel?: string;
  onPress?: () => void;
  type?: 'button' | 'submit' | 'reset';
  /** 'bare' drops the resting fill and border - glyph only, neutral square on hover/ON. */
  variant?: 'default' | 'bare';
}

export function IconLabelButton({
  label,
  icon,
  active = false,
  disabled = false,
  className,
  title,
  ariaLabel,
  onPress,
  type = 'button',
  variant = 'default',
}: IconLabelButtonProps) {
  const pointerHandledRef = useRef(false);
  const pointerResetRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (pointerResetRef.current != null) {
      window.clearTimeout(pointerResetRef.current);
    }
  }, []);

  const commit = () => {
    if (!disabled) onPress?.();
  };

  const clearPointerHandled = () => {
    if (pointerResetRef.current != null) {
      window.clearTimeout(pointerResetRef.current);
    }
    pointerResetRef.current = window.setTimeout(() => {
      pointerHandledRef.current = false;
      pointerResetRef.current = null;
    }, 250);
  };

  const btn = (
    <button
      type={type}
      className={`${styles.button} ${variant === 'bare' ? styles.bare : ''} ${className ?? ''}`}
      data-active={active ? 'true' : undefined}
      aria-pressed={active}
      aria-label={ariaLabel}
      disabled={disabled}
      onPointerUp={event => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        pointerHandledRef.current = true;
        clearPointerHandled();
        commit();
      }}
      onClick={() => {
        if (pointerHandledRef.current) {
          pointerHandledRef.current = false;
          return;
        }
        commit();
      }}
    >
      {icon && <span className={styles.icon}>{icon}</span>}
      {label != null && label !== '' && <span className={styles.label}>{label}</span>}
    </button>
  );
  return title ? <HoverTooltip body={title} side="top">{btn}</HoverTooltip> : btn;
}
