import { useMemo, type CSSProperties } from 'react';
import type { KeebKey, KeyboardState } from '../../../api/keeb';
import { getKeyGlyph, type KeebLayoutKind } from './keebGlyphs';
import { getKeebLayoutRows } from './keebLayout';
import styles from './KeebKeyboard.module.scss';

export interface KeebKeyboardProps {
  state: KeyboardState;
  /** When the user clicks a physical key — first arg is the firmware (x, y) matrix. */
  onKeyClick?: (x: number, y: number) => void;
  selected?: { x: number; y: number } | null;
  /** When the rotary wheels are clickable (rotary assignment tab). */
  onWheelFocus?: (side: 'left' | 'right') => void;
  focusedWheel?: 'left' | 'right' | null;
  /** Overlay copy when no keeb is attached. */
  offlineCopy?: string;
  /** Whether key clicks should be ignored (e.g. while loading). */
  disabled?: boolean;
}

/// Renders the HYTE Keeb TKL keyboard. Each cell shows the function currently
/// assigned to that physical key on the active layer — falling back to the
/// printed legend when the firmware has the default mapping (or when offline).
///
/// The fixed-pixel layout matches the legacy nexus app's keeb modal exactly,
/// so muscle memory transfers; CSS `zoom` on the wrapper scales it to the
/// available viewport.
export function KeebKeyboard({
  state,
  onKeyClick,
  selected,
  onWheelFocus,
  focusedWheel,
  offlineCopy,
  disabled,
}: KeebKeyboardProps) {
  const layout: KeebLayoutKind = state.layout === 'ISO' ? 'ISO' : 'ANSI';
  const rows = useMemo(() => getKeebLayoutRows(layout), [layout]);

  return (
    <div className={styles.keyboard}>
      {offlineCopy && !state.isConnected && (
        <div className={styles.offlineBanner}>{offlineCopy}</div>
      )}

      <div className={styles.wheels} aria-hidden="true">
        <button
          type="button"
          className={`${styles.wheel} ${focusedWheel === 'left' ? styles.wheelFocused : ''}`}
          onClick={() => onWheelFocus?.('left')}
          aria-label="Left wheel"
        >
          L
        </button>
        <button
          type="button"
          className={`${styles.wheel} ${focusedWheel === 'right' ? styles.wheelFocused : ''}`}
          onClick={() => onWheelFocus?.('right')}
          aria-label="Right wheel"
        >
          R
        </button>
      </div>

      {rows.map((row, x) => (
        <div key={x} className={styles.row}>
          {row.map((cell, y) => {
            const assigned: KeebKey | undefined = state.keys[x]?.[y];
            const func = assigned?.function || cell.function;
            const isSelected = selected?.x === x && selected?.y === y;
            const cls = [
              styles.key,
              isSelected ? styles.keySelected : '',
              disabled ? styles.keyDisabled : '',
            ].filter(Boolean).join(' ');
            const style: CSSProperties = { ...(cell.style ?? {}) };
            return (
              <button
                type="button"
                key={`${x}-${y}-${cell.function}`}
                className={cls}
                style={style}
                title={func}
                disabled={disabled}
                onClick={() => onKeyClick?.(x, y)}
              >
                {getKeyGlyph(func, layout)}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
