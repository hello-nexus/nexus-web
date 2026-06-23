// Blessed host components (React 19) - the real, panel-themed widgets the host
// renders for each SDK element. These are pure (props + children); the RemoteTree
// feeds them synced properties + event listeners. An author can ONLY cause one of
// these to render, which is the structural visual-consistency guarantee.

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { Slider as NativeSlider } from '../../components/common/Slider/Slider';
import { Button as NativeButton } from '../../components/common/Button/Button';
import type { ButtonTone } from '../../components/common/Button/Button';
import { ICON_TABLE } from './icons';
import { alignValue, justifyValue, weightValue, toneVar, cssSize } from './tokens';
import { useLongPress } from './useLongPress';

export interface HostProps {
  children?: ReactNode;
  /** Event listeners synced from the worker (keyed by contract event name). */
  __events?: Record<string, ((...args: unknown[]) => void) | undefined>;
  [key: string]: unknown;
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const TEXT_ALIGN: Record<string, CSSProperties['textAlign']> = { start: 'left', center: 'center', end: 'right' };

export function Stack(p: HostProps) {
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: p.direction === 'row' ? 'row' : 'column',
    gap: num(p.gap),
    alignItems: alignValue(str(p.align), 'stretch'),
    justifyContent: justifyValue(str(p.justify), 'flex-start'),
    padding: num(p.padding),
    flexWrap: p.wrap ? 'wrap' : undefined,
    flex: p.grow ? 1 : (typeof p.basis === 'string' ? `0 0 ${p.basis}` : num(p.flex)),
    minWidth: 0, minHeight: 0,
  };
  return <div style={style}>{p.children}</div>;
}

export function Grid(p: HostProps) {
  const cols = num(p.columns);
  const rows = num(p.rows);
  const style: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: cols ? `repeat(${cols}, minmax(0, 1fr))` : undefined,
    gridTemplateRows: rows ? `repeat(${rows}, minmax(0, 1fr))` : undefined,
    gap: num(p.gap),
    padding: num(p.padding),
    alignItems: alignValue(str(p.align), 'stretch'),
    justifyItems: alignValue(str(p.justify), 'stretch'),
    flex: p.grow ? 1 : undefined,
    minWidth: 0, minHeight: 0,
  };
  return <div style={style}>{p.children}</div>;
}

export function Frame(p: HostProps) {
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: p.direction === 'row' ? 'row' : 'column',
    gap: num(p.gap),
    padding: num(p.padding) ?? 12,
    alignItems: alignValue(str(p.align), 'stretch'),
    justifyContent: justifyValue(str(p.justify), 'flex-start'),
    background: p.tone ? toneVar(str(p.tone)) : 'var(--surface, rgba(255,255,255,0.05))',
    borderRadius: num(p.radius) ?? 12,
    border: p.border ? '1px solid var(--border, rgba(255,255,255,0.10))' : undefined,
    flex: p.grow ? 1 : undefined,
    minWidth: 0, minHeight: 0,
  };
  return <div style={style}>{p.children}</div>;
}

export function Spacer(p: HostProps) {
  const size = num(p.size);
  return <div style={{ flex: size ? undefined : 1, width: size, height: size }} />;
}

export function Divider(p: HostProps) {
  return <div style={{ alignSelf: 'stretch', height: 1, background: toneVar(str(p.tone), 'var(--border, rgba(255,255,255,0.12))') }} />;
}

export function Text(p: HostProps) {
  const ls = num(p.letterSpacing);
  const style: CSSProperties = {
    color: toneVar(str(p.tone), 'var(--text, currentColor)'),
    fontSize: cssSize(p.size as number | string | undefined),
    fontWeight: weightValue(str(p.weight)),
    textAlign: TEXT_ALIGN[str(p.align) ?? ''],
    textTransform: str(p.transform) as CSSProperties['textTransform'],
    fontFamily: p.mono ? 'ui-monospace, monospace' : undefined,
    opacity: num(p.opacity),
    letterSpacing: ls != null ? `${ls}em` : undefined,
    lineHeight: num(p.lineHeight),
    fontVariantNumeric: p.tabular ? 'tabular-nums' : undefined,
    whiteSpace: p.truncate ? 'nowrap' : undefined,
    overflow: p.truncate ? 'hidden' : undefined,
    textOverflow: p.truncate ? 'ellipsis' : undefined,
  };
  const content: ReactNode = p.value != null ? String(p.value) : p.children;
  return <span style={style}>{content}</span>;
}

export function Icon(p: HostProps) {
  const Icn = ICON_TABLE[(str(p.name) ?? '').toLowerCase()];
  if (!Icn) return null;
  return <Icn size={num(p.size) ?? 18} color={toneVar(str(p.tone), 'currentColor')} aria-hidden="true" />;
}

function pctOf(value: unknown, min: unknown, max: unknown): number {
  const v = num(value) ?? 0; const lo = num(min) ?? 0; const hi = num(max) ?? 100;
  if (hi === lo) return 0;
  return Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
}

export function Bar(p: HostProps) {
  const fill = pctOf(p.value, p.min, p.max);
  const tone = toneVar(str(p.tone), 'var(--accent, currentColor)');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      {p.label != null && <span style={{ fontSize: 11, color: 'var(--text-dim, currentColor)' }}>{String(p.label)}</span>}
      <div style={{ height: 8, borderRadius: 999, background: 'var(--border, rgba(255,255,255,0.12))', overflow: 'hidden' }}>
        <div style={{ width: `${fill * 100}%`, height: '100%', background: tone, borderRadius: 999 }} />
      </div>
    </div>
  );
}

// Host-owned gradients so authors get a temperature ramp without passing raw
// colours (cold→warm is semantic, not branding).
const RANGE_GRADIENT: Record<string, string> = {
  temp: 'linear-gradient(90deg, #38bdf8, var(--accent-glow, #67e8f9), #fbbf24)',
  accent: 'linear-gradient(90deg, var(--accent-deep, #22d3ee), var(--accent-glow, #67e8f9))',
};

export function Range(p: HostProps) {
  const min = num(p.min) ?? 0; const max = num(p.max) ?? 1;
  const lo = num(p.lo) ?? min; const hi = num(p.hi) ?? max;
  const span = max - min || 1;
  const left = Math.max(0, Math.min(1, (lo - min) / span));
  const right = Math.max(0, Math.min(1, (hi - min) / span));
  const width = Math.max(0.04, right - left);
  const height = num(p.height) ?? 5;
  const radius = num(p.radius) ?? 999;
  const grad = RANGE_GRADIENT[str(p.gradient) ?? 'temp'] ?? RANGE_GRADIENT.temp;
  return (
    <div style={{ position: 'relative', flex: 1, height, borderRadius: radius, background: 'var(--border, rgba(255,255,255,0.10))', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', top: 0, bottom: 0, left: `${left * 100}%`, width: `${width * 100}%`,
        background: grad, borderRadius: radius,
        boxShadow: p.glow ? '0 0 6px var(--accent-glow, rgba(103,232,249,0.55))' : undefined,
      }} />
    </div>
  );
}

export function Ring(p: HostProps) {
  const fill = pctOf(p.value, p.min, p.max);
  const tone = toneVar(str(p.tone), 'var(--accent, currentColor)');
  const size = 72; const thickness = num(p.thickness) ?? 8;
  const r = (size - thickness) / 2; const c = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border, rgba(255,255,255,0.12))" strokeWidth={thickness} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={thickness}
          strokeDasharray={c} strokeDashoffset={c * (1 - fill)} strokeLinecap="round" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {p.label != null && <span style={{ fontSize: 16, fontWeight: 700 }}>{String(p.label)}</span>}
        {p.sublabel != null && <span style={{ fontSize: 10, color: 'var(--text-dim, currentColor)' }}>{String(p.sublabel)}</span>}
      </div>
    </div>
  );
}

// A 270° bottom-open arc meter (distinct from the full-donut Ring): a faint track
// with a tone-tinted fill sweeping from the lower-left up over the top to the
// lower-right, with an optional centred label/sublabel.
export function Gauge(p: HostProps) {
  const min = num(p.min) ?? 0;
  const max = num(p.max) ?? 100;
  const span = max - min || 1;
  const frac = Math.max(0, Math.min(1, ((num(p.value) ?? min) - min) / span));
  const color = toneVar(str(p.tone), 'var(--accent, currentColor)');
  const SIZE = 100, c = SIZE / 2, sw = 9, r = c - sw / 2 - 1;
  const START = 225, SWEEP = 270; // degrees; angle decreases start -> end (clockwise on screen)
  const pt = (deg: number): [number, number] => {
    const a = (deg * Math.PI) / 180;
    return [c + r * Math.cos(a), c - r * Math.sin(a)];
  };
  const arc = (fromDeg: number, toDeg: number): string => {
    const [x0, y0] = pt(fromDeg);
    const [x1, y1] = pt(toDeg);
    const large = Math.abs(fromDeg - toDeg) > 180 ? 1 : 0;
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, minHeight: 0, width: '100%' }}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ width: '100%', maxWidth: 170, overflow: 'visible' }} role="img" aria-label={str(p.label) ?? 'gauge'}>
        <path d={arc(START, START - SWEEP)} fill="none" strokeWidth={sw} strokeLinecap="round" stroke="var(--border, rgba(255,255,255,0.12))" />
        {frac > 0 && (
          <path d={arc(START, START - frac * SWEEP)} fill="none" strokeWidth={sw} strokeLinecap="round" stroke={color} />
        )}
        {p.label != null && (
          <text x={c} y={p.sublabel != null ? c - 4 : c} textAnchor="middle" dominantBaseline="middle"
            fill="var(--text, currentColor)" style={{ fontSize: 22, fontWeight: 600 }}>{String(p.label)}</text>
        )}
        {p.sublabel != null && (
          <text x={c} y={c + 15} textAnchor="middle" dominantBaseline="middle"
            fill="var(--text-dim, currentColor)" style={{ fontSize: 9, letterSpacing: 0.4 }}>{String(p.sublabel)}</text>
        )}
      </svg>
    </div>
  );
}

export function Sparkline(p: HostProps) {
  const values = Array.isArray(p.values) ? (p.values as number[]).filter((v) => Number.isFinite(v)) : [];
  const tone = toneVar(str(p.tone), 'var(--accent, currentColor)');
  if (values.length < 2) return <div style={{ height: 24 }} />;
  const min = num(p.min) ?? Math.min(...values);
  const max = num(p.max) ?? Math.max(...values);
  const span = max - min || 1;
  const w = 100; const h = 24;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / span) * h}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: h }}>
      <polyline points={pts} fill="none" stroke={tone} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Slider(p: HostProps) {
  const emit = (key: 'input' | 'change', value: number) => p.__events?.[key]?.(value);
  const rawFill = p.trackFill;
  const trackFill: boolean | number | undefined =
    typeof rawFill === 'number' ? rawFill : (rawFill != null ? !!rawFill : undefined);
  const rawOrientation = str(p.orientation);
  const orientation: 'inline' | 'stacked' | 'bare' | undefined =
    rawOrientation === 'inline' || rawOrientation === 'stacked' || rawOrientation === 'bare'
      ? rawOrientation : undefined;
  return (
    <NativeSlider
      label={str(p.label) ?? ''}
      value={num(p.value) ?? 0}
      min={num(p.min) ?? 0}
      max={num(p.max) ?? 100}
      step={num(p.step)}
      disabled={!!p.disabled}
      trackFill={trackFill}
      orientation={orientation}
      onChange={(v, commit) => {
        if (commit) emit('change', v);
        else emit('input', v);
      }}
      onCommit={(v) => emit('change', v)}
    />
  );
}

export function Stepper(p: HostProps) {
  const value = num(p.value) ?? 0;
  const step = num(p.step) ?? 1;
  const min = num(p.min); const max = num(p.max);
  const disabled = !!p.disabled;
  const emit = (next: number) => {
    let v = next;
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    p.__events?.change?.(v);
  };
  // Compact vertical chevron stepper (matches the native widget; narrow enough
  // for three side-by-side in a 2x2 timer cell).
  const chevron: CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 26, height: 18, padding: 0, lineHeight: 1, fontSize: 11,
    border: '1px solid var(--border, rgba(255,255,255,0.12))', borderRadius: 6,
    background: 'var(--surface, rgba(255,255,255,0.06))', color: 'inherit',
    cursor: disabled ? 'default' : 'pointer',
  };
  const atMax = max != null && value >= max;
  const atMin = min != null && value <= min;
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      <button type="button" aria-label="increment" style={{ ...chevron, opacity: disabled || atMax ? 0.35 : 1 }}
        disabled={disabled || atMax} onClick={() => emit(value + step)}>▲</button>
      <span style={{ minWidth: 26, textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: '1.3em', lineHeight: 1 }}>
        {String(value).padStart(2, '0')}
      </span>
      <button type="button" aria-label="decrement" style={{ ...chevron, opacity: disabled || atMin ? 0.35 : 1 }}
        disabled={disabled || atMin} onClick={() => emit(value - step)}>▼</button>
    </div>
  );
}

function sdkToneToNative(sdkTone: unknown, variant: unknown): ButtonTone {
  const t = str(sdkTone) ?? '';
  const v = str(variant) ?? 'soft';
  if (v === 'ghost') return 'ghost';
  if (t === 'bad') return 'danger';
  if (t === 'accent' && v === 'solid') return 'accent';
  if (v === 'solid') return 'accent';
  return 'neutral';
}

export function Button(p: HostProps) {
  const disabled = !!p.disabled;
  const label = str(p.label);
  const nativeTone = sdkToneToNative(p.tone, p.variant);
  const size = (str(p.size) ?? 'md') as 'sm' | 'md' | 'lg';
  const iconName = str(p.icon);
  const IconEl = iconName ? ICON_TABLE[iconName.toLowerCase()] : undefined;
  const iconNode: ReactNode = IconEl ? <IconEl size={size === 'sm' ? 12 : 16} aria-hidden="true" /> : undefined;
  const lp = useLongPress({
    onLongPress: p.__events?.longpress ? () => p.__events?.longpress?.() : undefined,
    onPress: () => p.__events?.press?.(),
    disabled,
  });
  return (
    <NativeButton
      tone={nativeTone}
      size={size}
      disabled={disabled}
      icon={iconNode}
      aria-label={label ?? undefined}
      onPointerDown={lp.onPointerDown}
      onPointerUp={lp.onPointerUp}
      onPointerLeave={lp.onPointerLeave}
      onPointerCancel={lp.onPointerCancel}
      onClick={lp.onClick}
    >
      {p.children ?? (label != null ? label : null)}
    </NativeButton>
  );
}

// Only these schemes load - never a bare http: or javascript: URL from a worker.
const SAFE_IMG = /^(https:|data:image\/|blob:)/i;
export function Image(p: HostProps) {
  const src = str(p.src);
  if (!src || !SAFE_IMG.test(src)) return null;
  const style: CSSProperties = {
    objectFit: (str(p.fit) ?? 'cover') as CSSProperties['objectFit'],
    width: num(p.width) ?? '100%', height: num(p.height),
    aspectRatio: p.aspect != null ? String(p.aspect) : undefined,
    borderRadius: num(p.radius) ?? 0,
    background: p.tone ? toneVar(str(p.tone)) : undefined,
    display: 'block', minWidth: 0,
  };
  return <img src={src} alt={str(p.alt) ?? ''} style={style} loading="lazy" referrerPolicy="no-referrer" draggable={false} />;
}

export function Scroll(p: HostProps) {
  const dir = str(p.direction) ?? 'vertical';
  const style: CSSProperties = {
    display: 'flex', flexDirection: dir === 'horizontal' ? 'row' : 'column',
    gap: num(p.gap), padding: num(p.padding),
    overflowX: dir === 'horizontal' || dir === 'both' ? 'auto' : 'hidden',
    overflowY: dir === 'vertical' || dir === 'both' ? 'auto' : 'hidden',
    flex: p.grow ? 1 : undefined, minWidth: 0, minHeight: 0,
  };
  return <div style={style}>{p.children}</div>;
}

export function Input(p: HostProps) {
  const ref = useRef<HTMLInputElement>(null);
  const value = str(p.value) ?? '';
  const lastSet = useRef<string | null>(null);
  // Apply a programmatic value (reset/compute result) only when the prop actually
  // changes - never on every render - so local typing keeps a stable cursor.
  useEffect(() => {
    if (lastSet.current !== value && ref.current) ref.current.value = value;
    lastSet.current = value;
  }, [value]);
  const emit = (k: 'input' | 'submit' | 'blur', v: string) => p.__events?.[k]?.(v);
  const style: CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    padding: p.size === 'sm' ? '5px 8px' : '8px 10px',
    borderRadius: 8, border: '1px solid var(--border, rgba(255,255,255,0.14))',
    background: 'var(--surface, rgba(255,255,255,0.05))',
    color: toneVar(str(p.tone), 'var(--text, currentColor)'),
    font: 'inherit', fontFamily: p.mono ? 'ui-monospace, monospace' : undefined,
    textAlign: TEXT_ALIGN[str(p.align) ?? ''], outline: 'none',
  };
  return (
    <input
      ref={ref} type={str(p.type) ?? 'text'} placeholder={str(p.placeholder)}
      disabled={!!p.disabled} maxLength={num(p.maxLength)} defaultValue={value} style={style}
      onInput={(e) => emit('input', e.currentTarget.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') emit('submit', (e.currentTarget as HTMLInputElement).value); }}
      onBlur={(e) => emit('blur', e.currentTarget.value)}
    />
  );
}

interface ChartSeries { values: number[]; tone?: string; area?: boolean }
export function Chart(p: HostProps) {
  const series: ChartSeries[] = Array.isArray(p.series)
    ? (p.series as ChartSeries[]).filter((s) => Array.isArray(s?.values))
    : [];
  const h = num(p.height) ?? 80;
  const all = series.flatMap((s) => s.values.filter((v) => Number.isFinite(v)));
  if (all.length < 2) return <div style={{ height: h }} />;
  const min = num(p.min) ?? Math.min(...all);
  const max = num(p.max) ?? Math.max(...all);
  const span = max - min || 1;
  const W = 100, H = 100;
  const project = (vals: number[]) =>
    vals.map((v, i) => `${vals.length > 1 ? (i / (vals.length - 1)) * W : 0},${(H - ((v - min) / span) * H).toFixed(2)}`);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: h, overflow: 'visible' }}>
      {!!p.gridlines && [0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={0} y1={H * g} x2={W} y2={H * g} stroke="var(--border, rgba(255,255,255,0.10))" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
      ))}
      {series.map((s, si) => {
        const pts = project(s.values).join(' ');
        const tone = toneVar(s.tone ?? str(p.tone), 'var(--accent, currentColor)');
        return (
          <g key={si}>
            {s.area && <polygon points={`0,${H} ${pts} ${W},${H}`} fill={tone} opacity={0.15} />}
            <polyline points={pts} fill="none" stroke={tone} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </g>
        );
      })}
    </svg>
  );
}

// A small status pill. `label` tinted by `tone`; optional leading `icon`. No
// native Badge exists, so this is a host primitive (tokens keep it on-theme).
export function Badge(p: HostProps) {
  const color = toneVar(str(p.tone), 'var(--text)');
  const Icn = ICON_TABLE[(str(p.icon) ?? '').toLowerCase()];
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
        lineHeight: 1.45, whiteSpace: 'nowrap', color,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
      }}
    >
      {Icn ? <Icn size={12} aria-hidden="true" /> : null}
      {str(p.label) ?? ''}
    </span>
  );
}

// An indeterminate loading spinner - a rotating arc over a faint track ring.
// SMIL-animated so it's self-contained (no global @keyframes to inject). `size`
// is px (default 20); `tone` tints it (default accent).
export function Spinner(p: HostProps) {
  const size = num(p.size) ?? 20;
  const color = toneVar(str(p.tone), 'var(--accent, #2563eb)');
  const sw = Math.max(2, Math.round(size / 10));
  const r = (size - sw) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  return (
    <svg
      width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      role="img" aria-label="Loading" style={{ display: 'block' }}
    >
      <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeOpacity={0.18} strokeWidth={sw} />
      <circle
        cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round"
        strokeDasharray={`${circ * 0.28} ${circ}`}
      >
        <animateTransform
          attributeName="transform" type="rotate"
          from={`0 ${c} ${c}`} to={`360 ${c} ${c}`}
          dur="0.8s" repeatCount="indefinite"
        />
      </circle>
    </svg>
  );
}
