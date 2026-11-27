import { createContext, useCallback, useContext, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { columnFitScale, uniformColumnScale } from './microColumnScale';
import { Sparkline } from '../../../components/common/Sparkline/Sparkline';
import { PERF_HISTORY_SAMPLES } from '../common/panelHistoryConfig';
import { GaugeValue, GaugeValueStateContext } from './gauges/GaugeValue';
import { GaugeTrack } from './gauges/GaugeTrack';
import { gaugeValueStateAttrs, type GaugeGradient } from './valueColor';
import { GAUGE_LINE_THICKNESS } from './gauges/types';
import type { MicroAlign, MicroDesignKey } from './perfSlots';
import { useFitWidth } from '../common/useFitWidth';
import styles from './MicroBar.module.scss';

interface MicroBarProps {
  label: string;
  /** Full sensor name; the Vertical Bars accessible name, as `label` may be hidden or custom. */
  name?: string;
  formatted: string;
  fillPercent: number;
  // One of the Micro design keys (see MICRO_DESIGN_KEYS): 'bar' (fill track),
  // 'fill' (value fill behind the caption), 'backdrop' (dim history graph),
  // 'simple' (label over value, no figure).
  design?: MicroDesignKey;
  // Only read by the 'simple' design: alignment of its label and value.
  align?: MicroAlign;
  // Only read by the 'backdrop' design (the dim filled history trace).
  history?: number[];
  historyDomain?: [number, number];
  /** The panel gradient painted into the row's figure; null keeps the accent. */
  gradient?: GaugeGradient | null;
  /** --panel-accent* overrides when the row is value-coloured (see valueColor.ts). */
  style?: CSSProperties;
}

// Vertical Bars rows report the scale their own value needs; the provider keeps
// the smallest so every column renders its value at one size.
interface ColumnScaleValue {
  scale: number;
  report: (id: string, needed: number) => void;
  drop: (id: string) => void;
}
const ColumnScaleContext = createContext<ColumnScaleValue | null>(null);

export function ColumnScaleProvider({ children }: { children: ReactNode }) {
  const needed = useRef(new Map<string, number>());
  const [scale, setScale] = useState(1);
  const sync = useCallback(() => {
    const next = uniformColumnScale(needed.current.values());
    setScale(prev => (prev === next ? prev : next));
  }, []);
  const report = useCallback((id: string, n: number) => { needed.current.set(id, n); sync(); }, [sync]);
  const drop = useCallback((id: string) => { needed.current.delete(id); sync(); }, [sync]);
  const value = useMemo(() => ({ scale, report, drop }), [scale, report, drop]);
  return <ColumnScaleContext.Provider value={value}>{children}</ColumnScaleContext.Provider>;
}

function useColumnFit() {
  const ctx = useContext(ColumnScaleContext);
  const id = useId();
  const [box, setBox] = useState<HTMLElement | null>(null);
  const [content, setContent] = useState<HTMLElement | null>(null);
  const [local, setLocal] = useState(1);
  useLayoutEffect(() => {
    if (!box || !content) return undefined;
    const update = () => {
      const needed = columnFitScale(box.clientWidth, content.scrollWidth);
      if (ctx) ctx.report(id, needed);
      else setLocal(needed);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(box);
    ro.observe(content);
    return () => { ro.disconnect(); ctx?.drop(id); };
  // ctx.report/drop are stable; the provider value changing must not re-measure.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box, content, id, ctx?.report, ctx?.drop]);
  return { boxRef: setBox, contentRef: setContent, scale: ctx ? ctx.scale : local };
}

function ColumnRow({ name, formatted, fillPercent, style }: { name?: string; formatted: string; fillPercent: number; style?: CSSProperties }) {
  const { boxRef, contentRef, scale } = useColumnFit();
  const clamped = Math.max(0, Math.min(100, fillPercent));
  return (
    <div className={styles.rowColumn} style={style} role={name ? 'group' : undefined} aria-label={name || undefined}>
      <div className={styles.columnTrack}>
        <div className={styles.columnFill} style={{ height: `${clamped}%` }} />
      </div>
      <div ref={boxRef} className={styles.columnValueBox}>
        <div ref={contentRef} className={styles.columnValueContent} style={{ transform: `scale(${scale})` }}>
          <GaugeValue formatted={formatted} className={styles.columnValue} />
        </div>
      </div>
    </div>
  );
}

function SimpleRow({ label, formatted, align, style }: { label: string; formatted: string; align: MicroAlign; style?: CSSProperties }) {
  const { boxRef, contentRef, scale } = useFitWidth(1, true);
  return (
    <div ref={boxRef} className={styles.rowSimple} style={style}>
      <div ref={contentRef} className={`${styles.simpleContent} ${styles[`align_${align}`]}`} style={{ transform: `scale(${scale})` }}>
        {label && <span className={styles.simpleLabel}>{label}</span>}
        <GaugeValue formatted={formatted} className={styles.simpleValue} align={align} />
      </div>
    </div>
  );
}

// The state is stamped on the value element only (through the context), never on the row.
export function MicroBar(props: MicroBarProps) {
  const { gradient, style, fillPercent } = props;
  const state = gradient && style ? gaugeValueStateAttrs(gradient.stops, fillPercent / 100)['data-value-state'] : undefined;
  return <GaugeValueStateContext.Provider value={state}><MicroBarRow {...props} /></GaugeValueStateContext.Provider>;
}

function MicroBarRow({ label, name, formatted, fillPercent, design = 'bar', align = 'left', history, historyDomain, gradient, style }: MicroBarProps) {
  if (design === 'columns') return <ColumnRow name={name} formatted={formatted} fillPercent={fillPercent} style={style} />;
  if (design === 'simple') return <SimpleRow label={label} formatted={formatted} align={align} style={style} />;

  const head = (
    <div className={styles.head}>
      {label && <span className={styles.label}>{label}</span>}
      <GaugeValue formatted={formatted} className={styles.value} />
    </div>
  );

  if (design === 'fill') {
    const clamped = Math.max(0, Math.min(100, fillPercent));
    return (
      <div className={styles.rowFill} style={style}>
        <div className={styles.fillBar} style={{ width: `${clamped}%` }} />
        {head}
      </div>
    );
  }

  if (design === 'backdrop') {
    return (
      <div className={styles.rowGraph} style={style}>
        <div className={styles.graphChart}>
          <Sparkline
            values={history ?? []}
            domain={historyDomain ?? [0, 100]}
            color="var(--panel-accent-shadow)"
            strokeWidth={0}
            fillOpacity={1}
            padding={GAUGE_LINE_THICKNESS}
            sampleCount={PERF_HISTORY_SAMPLES}
            width={160}
            height={36}
          />
        </div>
        {head}
      </div>
    );
  }

  return (
    <div className={styles.row} style={style}>
      {head}
      <GaugeTrack fillPercent={fillPercent} gradient={gradient} />
    </div>
  );
}
