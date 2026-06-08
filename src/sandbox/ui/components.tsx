// Blessed host components (React 19) — the real, panel-themed widgets the host
// renders for each SDK element. These are pure (props + children); the RemoteTree
// feeds them synced properties + event listeners. An author can ONLY cause one of
// these to render, which is the structural visual-consistency guarantee.

import type { CSSProperties, ReactNode } from 'react';
import { ICON_TABLE } from './icons';
import { alignValue, justifyValue, weightValue, toneVar, cssSize } from './tokens';

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
    flex: p.grow ? 1 : num(p.flex),
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
    background: p.tone ? toneVar(str(p.tone)) : 'var(--bg-card, rgba(255,255,255,0.05))',
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

export function Gauge(p: HostProps) {
  // Reuse the ring visual for now; a later pass swaps in the polished meter.
  return <Ring {...p} />;
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
  const disabled = !!p.disabled;
  const emit = (key: 'input' | 'change', value: number) => p.__events?.[key]?.(value);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      {p.label != null && <span style={{ fontSize: 11, color: 'var(--text-dim, currentColor)' }}>{String(p.label)}</span>}
      <input
        type="range"
        disabled={disabled}
        min={num(p.min) ?? 0} max={num(p.max) ?? 100} step={num(p.step) ?? 1}
        value={num(p.value) ?? 0}
        style={{ accentColor: toneVar(str(p.tone), 'var(--accent, currentColor)'), width: '100%' }}
        onChange={(e) => emit('input', Number(e.currentTarget.value))}
        onPointerUp={(e) => emit('change', Number((e.currentTarget as HTMLInputElement).value))}
        onKeyUp={(e) => emit('change', Number((e.currentTarget as HTMLInputElement).value))}
      />
    </div>
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
    background: 'var(--bg-card, rgba(255,255,255,0.06))', color: 'inherit',
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

export function Button(p: HostProps) {
  const variant = (str(p.variant) ?? 'soft') as 'solid' | 'soft' | 'ghost';
  const tone = toneVar(str(p.tone), 'var(--text, currentColor)');
  const disabled = !!p.disabled;
  const style: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: p.size === 'sm' ? '5px 9px' : p.size === 'lg' ? '11px 16px' : '8px 12px',
    borderRadius: 10, cursor: disabled ? 'default' : 'pointer',
    border: variant === 'ghost' ? '1px solid transparent' : '1px solid var(--border, rgba(255,255,255,0.12))',
    background: variant === 'solid' ? tone : variant === 'ghost' ? 'transparent' : 'var(--bg-card, rgba(255,255,255,0.06))',
    color: variant === 'solid' ? 'var(--bg, #0b0b0c)' : tone,
    opacity: disabled ? 0.4 : 1, font: 'inherit', fontWeight: 600, lineHeight: 1,
  };
  const label = str(p.label);
  return (
    <button
      type="button" style={style} disabled={disabled} aria-label={label}
      onClick={() => { if (!disabled) p.__events?.press?.(); }}
    >
      {p.children ?? (label != null ? label : null)}
    </button>
  );
}
