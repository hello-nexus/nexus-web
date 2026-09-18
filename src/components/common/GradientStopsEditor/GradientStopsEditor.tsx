import { useCallback, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type KeyboardEvent } from 'react';
import { ColorPickerWithPresets } from '../ColorPickerWithPresets/ColorPickerWithPresets';
import { PRESET_ACCENTS } from '../../../lib/settings';
import { useTranslation } from '../../../lib/i18n';
import {
  gaugeGradientColorAt,
  gaugeGradientCssStops,
  type GaugeGradientStop,
} from '../../../panel/theme/gaugeGradient';
import styles from './GradientStopsEditor.module.scss';

export interface GradientStopsEditorProps {
  stops: readonly GaugeGradientStop[];
  /** Live while a handle is dragged or a colour previewed; nothing persists. */
  onPreview: (stops: GaugeGradientStop[]) => void;
  onCommit: (stops: GaugeGradientStop[]) => void;
  minStops: number;
  maxStops: number;
  className?: string;
}

// Pointer travel (px) before a press counts as a drag rather than a tap.
const TAP_SLOP = 6;
// Vertical travel (px) off the bar that removes the dragged stop on release.
const REMOVE_DISTANCE = 44;
// Half the handle's hit width (px); a press this close to a handle grabs it.
const HANDLE_HIT = 18;
// Neighbouring stops keep at least this much of the scale between them, so a
// drag can reorder nothing and a gradient never has two stops on one point.
const MIN_GAP = 0.02;

interface Drag {
  index: number;
  startX: number;
  startY: number;
  moved: boolean;
  removing: boolean;
  dy: number;
}

/**
 * Touch-first gradient editor: a bar painted with the stops, one handle per
 * stop. Drag a handle along the bar to move it, drag it off the bar to remove
 * it, tap it to recolour it (the shared preset picker opens underneath), tap
 * empty bar to add a stop with the colour already there.
 */
export function GradientStopsEditor({ stops, onPreview, onCommit, minStops, maxStops, className }: GradientStopsEditorProps) {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  // The stops as they stand mid-gesture; the prop is the last committed list.
  const [draft, setDraft] = useState<GaugeGradientStop[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const shown = draft ?? stops;
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
      const next = [...shown, { at, color: gaugeGradientColorAt(shown, at) }].sort((a, b) => a.at - b.at);
      setSelected(next.findIndex(s => s.at === at));
      onCommit(next);
      return;
    }
    dragRef.current = { index: nearest, startX: event.clientX, startY: event.clientY, moved: false, removing: false, dy: 0 };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP) return;
    drag.moved = true;
    drag.dy = dy;
    drag.removing = canRemove && Math.abs(dy) >= REMOVE_DISTANCE;
    const at = clampBetweenNeighbours(shown, drag.index, fractionAt(event.clientX));
    const next = shown.map((stop, i) => (i === drag.index ? { ...stop, at } : stop));
    setDraft(next);
    // Force a re-render for the lift-off transform even when `at` is pinned.
    setSelected(prev => prev);
    onPreview(next);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const current = draft ?? [...shown];
    setDraft(null);
    if (!drag.moved) {
      setSelected(prev => (prev === drag.index ? null : drag.index));
      return;
    }
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
      if ((event.key === 'Delete' || event.key === 'Backspace') && canRemove) {
        event.preventDefault();
        setSelected(null);
        onCommit(stops.filter((_, i) => i !== index));
      }
      return;
    }
    event.preventDefault();
    const at = clampBetweenNeighbours(stops, index, stops[index].at + step);
    onCommit(stops.map((stop, i) => (i === index ? { ...stop, at } : stop)));
  };

  const recolour = (hex: string, commit: boolean) => {
    if (selected === null || selected >= shown.length) return;
    const next = shown.map((stop, i) => (i === selected ? { ...stop, color: hex } : stop));
    if (commit) onCommit(next);
    else onPreview(next);
  };

  const drag = dragRef.current;

  return (
    <div className={className ? `${styles.root} ${className}` : styles.root}>
      <div
        ref={trackRef}
        className={styles.track}
        style={{ background: `linear-gradient(90deg, ${gaugeGradientCssStops(shown)})` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        role="group"
        aria-label={t('gradientEditor.bar')}
      >
        {shown.map((stop, i) => {
          const lifting = drag?.index === i && drag.moved ? drag.dy : 0;
          const removing = drag?.index === i && drag.removing;
          return (
            <button
              key={i}
              type="button"
              className={`${styles.handle} ${selected === i ? styles.handleSelected : ''} ${removing ? styles.handleRemoving : ''}`}
              style={{
                left: `${stop.at * 100}%`,
                '--stop-color': stop.color,
                '--lift': `${lifting}px`,
              } as CSSProperties}
              aria-label={t('gradientEditor.stop', { percent: Math.round(stop.at * 100) })}
              aria-pressed={selected === i}
              onKeyDown={event => handleKeyDown(event, i)}
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
      {selected !== null && selected < shown.length && (
        <ColorPickerWithPresets
          className={styles.picker}
          value={shown[selected].color}
          presets={PRESET_ACCENTS}
          allowCustom
          onPreview={hex => recolour(hex, false)}
          onCommit={hex => recolour(hex, true)}
        />
      )}
    </div>
  );
}
