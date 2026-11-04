import { useLayoutEffect, useRef, useState } from 'react';
import { ChevronUp } from 'lucide-react';
import { layoutMarks, markAnchor } from './markGeometry';
import styles from './Slider.module.scss';

export interface SliderMark {
  /** Position on the scale, in [min, max]. */
  value: number;
  label: string;
  detail?: string;
  /** CSS color of the detail text and the pointer; omit for the text color. */
  color?: string;
  /** 'above' sits over the track with no pointer; default 'below' under it, pointing up at the value. */
  side?: 'above' | 'below';
  /** Larger detail text, for a headline figure. */
  large?: boolean;
}

interface Props {
  marks: readonly SliderMark[];
  min: number;
  max: number;
  knobPx: number;
  side: 'above' | 'below';
}

/** One row of labelled marks along a track, placed with the knob's travel so each points at its value. */
export function SliderMarks({ marks, min, max, knobPx, side }: Props) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const boxRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [layout, setLayout] = useState<{ left: number[]; anchor: number[]; h: number } | null>(null);
  const mine = marks.filter(m => (m.side ?? 'below') === side);
  const key = JSON.stringify(mine);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return undefined;
    const measure = () => {
      const trackW = row.clientWidth;
      const boxes = mine.map((m, i) => ({
        anchor: markAnchor(max === min ? 0 : (m.value - min) / (max - min), trackW, knobPx),
        w: boxRefs.current[i]?.offsetWidth ?? 0,
      }));
      const h = Math.max(0, ...mine.map((_, i) => boxRefs.current[i]?.offsetHeight ?? 0));
      setLayout({ left: layoutMarks(boxes, trackW), anchor: boxes.map(b => b.anchor), h });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, min, max, knobPx]);

  if (mine.length === 0) return null;
  return (
    <div ref={rowRef} className={styles.marks} style={{ height: layout?.h || undefined }}>
      {mine.map((m, i) => (
        <div
          key={`${m.value}-${m.label}`}
          ref={el => { boxRefs.current[i] = el; }}
          className={styles.mark}
          style={{ left: layout?.left[i] ?? 0, visibility: layout ? 'visible' : 'hidden', color: m.color }}
        >
          {side === 'below' && (
            <ChevronUp
              size={16}
              className={styles.markPointer}
              style={{ left: layout ? layout.anchor[i] - layout.left[i] - 8 : 0 }}
              aria-hidden
            />
          )}
          <span className={styles.markLabel}>{m.label}</span>
          {m.detail != null && <span className={m.large ? styles.markDetailLarge : styles.markDetail}>{m.detail}</span>}
        </div>
      ))}
    </div>
  );
}
