import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Card } from '../Card/Card';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import styles from './StatusRow.module.scss';

/*
 * One list row for a monitored thing: the name on the left (wraps at word
 * boundaries), the reading with its status chip stacked beneath it and
 * right-aligned, then the on/off switch at the far right. Built on the shared
 * Card, so the selected treatment matches the app's other rails. Used by the
 * Watchlist and the Cooling fans list so both read identically.
 *
 * The reading never wraps (a unit stays beside its number); the name takes
 * the squeeze: two lines at most, then an ellipsis with the full name in a
 * hover tooltip.
 *
 * A row with no `value` and no `chip` (switched off) shows the name and switch
 * only; a row with no `toggle` (nothing to switch) shows the name and chip.
 */
interface StatusRowProps {
  name: ReactNode;
  /** A dim single line under the name (the hardware sensor behind it); the name then stays on one line. Omit for none. */
  subtitle?: ReactNode;
  /** Leading icon before the name; omit for none. */
  icon?: ReactNode;
  /** The reading, rendered above the chip. Omit for a switched-off row. */
  value?: ReactNode;
  chip?: ReactNode;
  /** Extra small line beneath the chip (e.g. how long a state has held). */
  note?: ReactNode;
  toggle?: ReactNode;
  /** Makes the name a button that selects the row. Omit for a non-selectable row. */
  onSelect?: () => void;
  selected?: boolean;
  /** Dims the name and reading (the thing is switched off). */
  dimmed?: boolean;
  /** Draws the danger border. */
  danger?: boolean;
  className?: string;
}

/** Whether `ref`'s content is cut off along `axis`, re-measured as it resizes. */
function useCutOff(ref: RefObject<HTMLElement | null>, axis: 'height' | 'width', deps: readonly unknown[]): boolean {
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setCut(axis === 'height' ? el.scrollHeight > el.clientHeight + 1 : el.scrollWidth > el.clientWidth + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller's content keys re-measure
  }, [ref, axis, ...deps]);
  return cut;
}

/** The name (two lines at most, one when a subtitle sits under it) and the optional subtitle; the full text rides a tooltip only while it is actually cut. */
function NameBlock({ name, subtitle, onSelect, selected }: { name: ReactNode; subtitle?: ReactNode; onSelect?: () => void; selected?: boolean }) {
  const textRef = useRef<HTMLSpanElement>(null);
  const subtitleRef = useRef<HTMLSpanElement>(null);
  const hasSubtitle = subtitle !== undefined && subtitle !== null && subtitle !== false && subtitle !== '';
  const nameCut = useCutOff(textRef, 'height', [name, hasSubtitle]);
  const subtitleCut = useCutOff(subtitleRef, 'width', [subtitle]);
  const text = <span ref={textRef} className={`${styles.nameText} ${hasSubtitle ? styles.oneLine : ''}`}>{name}</span>;
  return (
    <div className={styles.nameBlock}>
      <HoverTooltip body={nameCut ? name : ''} side="top">
        {onSelect ? (
          <button type="button" className={styles.name} aria-pressed={Boolean(selected)} onClick={e => { e.stopPropagation(); onSelect(); }}>
            {text}
          </button>
        ) : (
          <span className={styles.name}>{text}</span>
        )}
      </HoverTooltip>
      {hasSubtitle && (
        <HoverTooltip body={subtitleCut ? subtitle : ''} side="top">
          <span ref={subtitleRef} className={styles.subtitle}>{subtitle}</span>
        </HoverTooltip>
      )}
    </div>
  );
}

export function StatusRow({ name, subtitle, icon, value, chip, note, toggle, onSelect, selected, dimmed, danger, className }: StatusRowProps) {
  const hasStatus = value !== undefined || chip !== undefined || note !== undefined;
  return (
    <Card
      compact
      interactive={Boolean(onSelect)}
      selected={selected}
      disableInteractiveRole
      onClick={onSelect}
      className={`${styles.card} ${dimmed ? styles.dimmed : ''} ${danger ? styles.danger : ''} ${className ?? ''}`}
    >
      <div className={styles.body}>
        {icon !== undefined && <span className={styles.icon} aria-hidden>{icon}</span>}
        <NameBlock name={name} subtitle={subtitle} onSelect={onSelect} selected={selected} />
        {hasStatus && (
          <span className={styles.status}>
            {value !== undefined && <span className={styles.value}>{value}</span>}
            {chip}
            {note !== undefined && <span className={styles.note}>{note}</span>}
          </span>
        )}
        {toggle !== undefined && (
          <span className={styles.toggle} role="presentation" onClick={e => e.stopPropagation()}>{toggle}</span>
        )}
      </div>
    </Card>
  );
}
