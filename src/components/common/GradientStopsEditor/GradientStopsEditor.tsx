import { useCallback, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type KeyboardEvent } from 'react';
import { ColorPickerWithPresets } from '../ColorPickerWithPresets/ColorPickerWithPresets';
import type { PopoverPlacement } from '../Popover/Popover';
import { PRESET_ACCENTS } from '../../../lib/settings';
import { useTranslation } from '../../../lib/i18n';
import {
  ACCENT_STOP_COLOR,
  gaugeGradientColorAt,
  gaugeGradientCssStops,
  resolveGaugeGradient,
  type GaugeGradientStop,
} from '../../../panel/theme/gaugeGradient';
import styles from './GradientStopsEditor.module.scss';

export interface GradientStopsEditorProps {
  /** The stored list; a stop coloured ACCENT_STOP_COLOR paints as `accent`. */
  stops: readonly GaugeGradientStop[];
  /** The accent hex a docked stop follows. */
  accent: string;
  /** Live while a handle is dragged or a colour previewed; nothing persists. */
  onPreview: (stops: GaugeGradientStop[]) => void;
  onCommit: (stops: GaugeGradientStop[]) => void;
  minStops: number;
  maxStops: number;
  className?: string;
}

// Pointer travel (px) before a press counts as a drag rather than a tap.
const TAP_SLOP = 6;
// Pointer travel (px) past either end of the bar that removes the dragged
// stop on release. Far enough that a drag to the very end does not remove.
const REMOVE_OVERSHOOT = 48;
// Half the handle's hit width (px); a press this close to a handle grabs it.
const HANDLE_HIT = 18;
// Neighbouring stops keep at least this much of the scale between them, so a
// drag can reorder nothing and a gradient never has two stops on one point.
const MIN_GAP = 0.02;
// The editor sits at the bottom of a sheet: the custom-colour wheel opens
// upward so it lands over the bar instead of below the fold.
const WHEEL_PLACEMENT: PopoverPlacement = 'top-end';

interface Drag {
  index: number;
  pointerType: string;
  startX: number;
  startY: number;
  moved: boolean;
  removing: boolean;
}

/**
 * Touch-first gradient editor: a bar painted with the stops, one handle per
 * stop. Drag a handle along the bar to move it, drag it out past either end
 * (or right-click it) to remove it. Touching a handle selects it, and the
 * preset picker underneath (greyed out until then) recolours the selected
 * stop, or the accent square docks it to the panel's accent colour. Tap
 * empty bar to add a stop with the colour already there.
 */
export function GradientStopsEditor({ stops, accent, onPreview, onCommit, minStops, maxStops, className }: GradientStopsEditorProps) {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  // The stops as they stand mid-gesture; the prop is the last committed list.
  const [draft, setDraft] = useState<GaugeGradientStop[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const shown = draft ?? stops;
  const painted = useMemo(() => resolveGaugeGradient(shown, accent), [shown, accent]);
  const canAdd = shown.length < maxStops;
  const canRemove = shown.length > minStops;

  const fractionAt = useCallback((clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const clampBetweenNeighbours = (list: readonly GaugeGradientStop[], index: number, at: number) => {
    const lo = index > 0 ? list[index - 1].at + MIN_GAP : 0;
    const hi = index < list.length - 1 ? list[index + 1].at - MIN_GAP : 1;
    // Neighbours closer than the gap (stored data, a very wide bar) leave no
    // room: hold the stop where it is rather than push it past one of them.
    if (lo > hi) return list[index].at;
    return Math.max(lo, Math.min(hi, at));
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = event.clientX - rect.left;
    let nearest = -1;
    let nearestDistance = Infinity;
    shown.forEach((stop, i) => {
      const distance = Math.abs(stop.at * rect.width - x);
      if (distance <= HANDLE_HIT && distance < nearestDistance) {
        nearest = i;
        nearestDistance = distance;
      }
    });
    event.preventDefault();
    if (nearest < 0) {
      if (!canAdd) return;
      const at = fractionAt(event.clientX);
      if (shown.some(stop => Math.abs(stop.at - at) < MIN_GAP)) return;
      const next = [...shown, { at, color: gaugeGradientColorAt(painted, at) }].sort((a, b) => a.at - b.at);
      setSelected(next.findIndex(s => s.at === at));
      onCommit(next);
      return;
    }
    // Touching a handle selects it, so the palette is live for whichever stop
    // was last dragged or tapped.
    setSelected(nearest);
    dragRef.current = {
      index: nearest, pointerType: event.pointerType, startX: event.clientX, startY: event.clientY, moved: false, removing: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP) return;
    drag.moved = true;
    const rect = trackRef.current?.getBoundingClientRect();
    const overshoot = rect
      ? Math.max(rect.left - event.clientX, event.clientX - rect.right)
      : 0;
    drag.removing = canRemove && overshoot >= REMOVE_OVERSHOOT;
    const at = clampBetweenNeighbours(shown, drag.index, fractionAt(event.clientX));
    const next = shown.map((stop, i) => (i === drag.index ? { ...stop, at } : stop));
    setDraft(next);
    onPreview(next);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const current = draft ?? [...shown];
    setDraft(null);
    if (!drag.moved) return;
    if (drag.removing) {
      setSelected(null);
      onCommit(current.filter((_, i) => i !== drag.index));
      return;
    }
    onCommit(current);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === 'ArrowLeft' ? -0.01 : event.key === 'ArrowRight' ? 0.01 : 0;
    if (step === 0) {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        removeAt(index);
      }
      return;
    }
    event.preventDefault();
    const at = clampBetweenNeighbours(stops, index, stops[index].at + step);
    onCommit(stops.map((stop, i) => (i === index ? { ...stop, at } : stop)));
  };

  const removeAt = (index: number) => {
    if (!canRemove) return;
    setSelected(null);
    onCommit(stops.filter((_, i) => i !== index));
  };

  const handleContextMenu = (event: ReactMouseEvent<HTMLButtonElement>, index: number) => {
    event.preventDefault();
    event.stopPropagation();
    // Chromium raises contextmenu on a touch press-and-hold too, which is how
    // a drag starts on a panel; only a real right-click removes.
    if (dragRef.current && dragRef.current.pointerType !== 'mouse') return;
    removeAt(index);
  };

  const recolour = (hex: string, commit: boolean) => {
    if (selected === null || selected >= shown.length) return;
    const next = shown.map((stop, i) => (i === selected ? { ...stop, color: hex } : stop));
    if (commit) onCommit(next);
    else onPreview(next);
  };

  const drag = dragRef.current;
  const hasSelection = selected !== null && selected < shown.length;
  const docked = hasSelection && shown[selected].color === ACCENT_STOP_COLOR;

  return (
    <div className={className ? `${styles.root} ${className}` : styles.root}>
      <div
        ref={trackRef}
        className={styles.track}
        style={{ background: `linear-gradient(90deg, ${gaugeGradientCssStops(painted)})` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        role="group"
        aria-label={t('gradientEditor.bar')}
      >
        {shown.map((stop, i) => {
          const removing = drag?.index === i && drag.removing;
          return (
            <button
              key={i}
              type="button"
              className={`${styles.handle} ${selected === i ? styles.handleSelected : ''} ${removing ? styles.handleRemoving : ''}`}
              style={{ left: `${stop.at * 100}%`, '--stop-color': painted[i].color } as CSSProperties}
              aria-label={t('gradientEditor.stop', { percent: Math.round(stop.at * 100) })}
              aria-pressed={selected === i}
              onKeyDown={event => handleKeyDown(event, i)}
              onContextMenu={event => handleContextMenu(event, i)}
              // The track owns the pointer gesture; a handle must not start a
              // second one or swallow the tap that selects it.
              onPointerDown={event => event.preventDefault()}
            />
          );
        })}
      </div>
      <div className={styles.labels}>
        {shown.map((stop, i) => (
          <span key={i} className={styles.label} style={{ left: `${stop.at * 100}%` }}>
            {Math.round(stop.at * 100)}
          </span>
        ))}
      </div>
      <ColorPickerWithPresets
        className={styles.picker}
        value={hasSelection ? painted[selected].color : ''}
        presets={PRESET_ACCENTS}
        allowCustom
        // Always in place so the sheet does not jump; live once a stop is tapped.
        disabled={!hasSelection}
        // The accent square: a stop docked to it follows the panel accent.
        extraSwatch={{
          color: accent,
          label: t('gradientEditor.accent'),
          selected: docked,
          onSelect: () => recolour(ACCENT_STOP_COLOR, true),
        }}
        pickerPlacement={WHEEL_PLACEMENT}
        onPreview={hex => recolour(hex, false)}
        onCommit={hex => recolour(hex, true)}
      />
    </div>
  );
}
