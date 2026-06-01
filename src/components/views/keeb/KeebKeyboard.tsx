import { useMemo, type CSSProperties } from 'react';
import type { KeebKey, KeyboardState } from '../../../api/keeb';
import { getKeyGlyph, type KeebLayoutKind } from './keebGlyphs';
import { getKeebLayoutRows } from './keebLayout';
import styles from './KeebKeyboard.module.scss';

/// What the user has selected on the keyboard. Either a physical key (drives
/// function-category writes) or one of the two rotary wheels (drives rotary
/// function writes). `null` means no selection — the views render hint copy.
export type KeebSelection =
  | { kind: 'key'; x: number; y: number }
  | { kind: 'wheel'; side: 'left' | 'right' }
  | null;

export interface KeebKeyboardProps {
  state: KeyboardState;
  /** Called when the user clicks a physical key or a wheel. */
  onSelect?: (selection: KeebSelection) => void;
  selected?: KeebSelection;
  /** Overlay copy when no keeb is attached. */
  offlineCopy?: string;
  /** Whether clicks should be ignored (e.g. while loading). */
  disabled?: boolean;
  /**
   * Render row 0 without the rotary wheels. Used by the source keyboard
   * inside Key Assignment, where the user picks a standard key to copy
   * onto the main keyboard's selection — wheels aren't a valid pick there.
   */
  hideWheels?: boolean;
  /**
   * Render every cell with its default (printed-legend) function and ignore
   * `state.keys`. Used by the source keyboard inside Key Assignment so the
   * picker keeps showing the physical-key layout even after the firmware
   * has been remapped — otherwise rebinding becomes circular ("I remapped
   * A→Q, now the A position shows Q, so how do I rebind back?").
   */
  useDefaults?: boolean;
}

/// Visual class for a (row, col) cell: row 0 col 0 is the firmware mode-cycle
/// key (pill), row 1 is the media strip (wide-short rounded), everything else
/// is the standard 75×70 key.
function keyVariant(row: number, col: number): string {
  if (row === 0 && col === 0) return styles.keyMiddle;
  if (row === 1) return styles.keyMedia;
  return '';
}

/// Renders the HYTE Keeb TKL keyboard. Each cell shows the function currently
/// assigned to that physical key on the active layer — falling back to the
/// printed legend when the firmware has the default mapping (or when offline).
///
/// The fixed-pixel layout matches the legacy keeb modal verbatim; CSS `zoom`
/// on the wrapper scales it to the available viewport.
///
/// Row 0 is special: it carries the two rotary wheel buttons flanking the
/// firmware-supplied RGB-effect-cycle key, mirroring the physical Keeb TKL.
export function KeebKeyboard({
  state,
  onSelect,
  selected,
  offlineCopy,
  disabled,
  hideWheels,
  useDefaults,
}: KeebKeyboardProps) {
  const layout: KeebLayoutKind = state.layout === 'ISO' ? 'ISO' : 'ANSI';
  const rows = useMemo(() => getKeebLayoutRows(layout), [layout]);

  const leftWheelSelected = selected?.kind === 'wheel' && selected.side === 'left';
  const rightWheelSelected = selected?.kind === 'wheel' && selected.side === 'right';

  const renderKey = (cell: { function: string; mode: string; style?: CSSProperties }, x: number, y: number, opts?: { stripAbsolute?: boolean }) => {
    const assigned: KeebKey | undefined = useDefaults ? undefined : state.keys[x]?.[y];
    const func = assigned?.function || cell.function;
    const isSelected = selected?.kind === 'key' && selected.x === x && selected.y === y;
    const cls = [
      styles.key,
      keyVariant(x, y),
      isSelected ? styles.keySelected : '',
      disabled ? styles.keyDisabled : '',
    ].filter(Boolean).join(' ');
    let style: CSSProperties;
    if (opts?.stripAbsolute) {
      // Row 0 legacy data positions RGBEffectLoop absolute at left:210; drop
      // that so it sits inline between the wheels.
      const { position, left, ...rest } = cell.style ?? {};
      void position; void left;
      style = rest;
    } else {
      style = { ...(cell.style ?? {}) };
    }
    return (
      <button
        type="button"
        key={`${x}-${y}-${cell.function}`}
        className={cls}
        style={style}
        title={func}
        disabled={disabled}
        onClick={() => onSelect?.({ kind: 'key', x, y })}
      >
        {getKeyGlyph(func, layout)}
      </button>
    );
  };

  return (
    <div className={styles.keyboard}>
      {offlineCopy && !state.isConnected && (
        <div className={styles.offlineBanner}>{offlineCopy}</div>
      )}

      {rows.map((row, x) => {
        if (x === 0) {
          // Row 0 = wheels + RGB-cycle middle button, all inline. Source
          // keyboards (Key Assignment "Keyboard" category) hide the wheels.
          return (
            <div key={x} className={`${styles.row} ${styles.topRow}`}>
              {!hideWheels && (
                <button
                  type="button"
                  className={`${styles.wheel} ${leftWheelSelected ? styles.wheelSelected : ''}`}
                  disabled={disabled}
                  aria-label="Left rotary wheel"
                  aria-pressed={leftWheelSelected}
                  onClick={() => onSelect?.({ kind: 'wheel', side: 'left' })}
                >
                  L
                </button>
              )}
              {row.map((cell, y) => renderKey(cell, x, y, { stripAbsolute: true }))}
              {!hideWheels && (
                <button
                  type="button"
                  className={`${styles.wheel} ${rightWheelSelected ? styles.wheelSelected : ''}`}
                  disabled={disabled}
                  aria-label="Right rotary wheel"
                  aria-pressed={rightWheelSelected}
                  onClick={() => onSelect?.({ kind: 'wheel', side: 'right' })}
                >
                  R
                </button>
              )}
            </div>
          );
        }

        // Row 1 holds the 9 media keys; their `.keyMedia` shrunk-rounded shape
        // is applied via `keyVariant`. Pad-align so they sit centered relative
        // to row 0's wheel-flanked top row above.
        const isMediaRow = x === 1;
        return (
          <div key={x} className={`${styles.row} ${isMediaRow ? styles.mediaRow : ''}`}>
            {row.map((cell, y) => renderKey(cell, x, y))}
          </div>
        );
      })}
    </div>
  );
}
