// Declarative widget renderer + binding helpers live together: the bind*
// utilities are tightly coupled to RenderContext and used by every meter.
// Splitting them out just to satisfy fast-refresh would create a one-import
// file that nothing else consumes. Loss of HMR for UnknownMeter is fine
// (it's an authoring-time fallback only).
 
import type { ReactNode } from 'react';
import type { WidgetView } from '../types';
import { evaluateBinding, resolvePath } from './bindings';
import { isMeterKind } from './meters/meterTypes';
import { VStack, HStack, Grid, Frame, Box, Divider, Spacer, Conditional, Switch as SwitchMeter, Repeat } from './meters/Layout';
import { Text, Value, Badge } from './meters/TextMeters';
import { Icon, ImageMeter } from './meters/Iconography';
import { SvgMeter } from './meters/SvgMeter';
import { Ring } from './meters/Ring';
import { Bar } from './meters/Bar';
import { Range } from './meters/Range';
import { Sparkline } from './meters/Sparkline';
import { Gauge } from './meters/Gauge';
import { Slider } from './meters/Slider';
import { Button } from './meters/Button';
import { Stepper } from './meters/Stepper';
import {
  WaterLevelMeter, ThermometerMeter, NumberFillMeter, DotGridMeter,
  MicrobarsMeter, WedgeMeter,
} from './meters/PerfGauges';

export interface RenderContext {
  data: Record<string, unknown>;
  settings: Record<string, unknown>;
  size: { width: number; height: number };
  // Widget id is plumbed through so meters that fetch assets
  // (e.g. <image src="assets/icon.png">) can resolve relative paths
  // to `/widgets-api/installed/{id}/asset/...`.
  widgetId: string;
  /** Widget-local state. Bound via `{local.*}`; mutated by `button`
   *  meters declaring `onClick: { localUpdate: { ... } }`. */
  local?: Record<string, unknown>;
  /** Button onClick.localUpdate handler. Wired by DeclarativeWidget. */
  onLocalUpdate?: (args: Record<string, unknown>, ctx: RenderContext) => void;
}

function asBindingContext(ctx: RenderContext): Record<string, unknown> {
  // Cast the strongly-typed RenderContext to the loose binding context the
  // expression evaluator expects. The evaluator walks paths against a
  // plain object, so the only contract that matters at runtime is that
  // top-level keys (`data`, `settings`, `size`, `widgetId`) exist - which
  // RenderContext guarantees by construction.
  return ctx as unknown as Record<string, unknown>;
}

/**
 * Walk a manifest view node and render it. Unknown meter types fall back
 * to a visible "unknown:<type>" cell so authoring mistakes surface during
 * dev rather than disappearing silently.
 */
export function renderView(view: WidgetView | undefined, ctx: RenderContext): ReactNode {
  if (!view || typeof view !== 'object') return null;
  const type = String(view.type ?? '');
  if (!isMeterKind(type)) return <UnknownMeter type={type} />;

  switch (type) {
    case 'vstack':      return <VStack view={view} ctx={ctx} />;
    case 'hstack':      return <HStack view={view} ctx={ctx} />;
    case 'grid':        return <Grid view={view} ctx={ctx} />;
    case 'frame':       return <Frame view={view} ctx={ctx} />;
    case 'box':         return <Box view={view} ctx={ctx} />;
    case 'divider':     return <Divider view={view} ctx={ctx} />;
    case 'spacer':      return <Spacer view={view} ctx={ctx} />;
    case 'conditional': return <Conditional view={view} ctx={ctx} />;
    case 'switch':      return <SwitchMeter view={view} ctx={ctx} />;
    case 'repeat':      return <Repeat view={view} ctx={ctx} />;
    case 'text':        return <Text view={view} ctx={ctx} />;
    case 'value':       return <Value view={view} ctx={ctx} />;
    case 'badge':       return <Badge view={view} ctx={ctx} />;
    case 'icon':        return <Icon view={view} ctx={ctx} />;
    case 'image':       return <ImageMeter view={view} ctx={ctx} />;
    case 'svg':         return <SvgMeter view={view} ctx={ctx} />;
    case 'ring':        return <Ring view={view} ctx={ctx} />;
    case 'bar':         return <Bar view={view} ctx={ctx} />;
    case 'range':       return <Range view={view} ctx={ctx} />;
    case 'sparkline':   return <Sparkline view={view} ctx={ctx} />;
    case 'gauge':       return <Gauge view={view} ctx={ctx} />;
    case 'slider':      return <Slider view={view} ctx={ctx} />;
    case 'button':      return <Button view={view} ctx={ctx} />;
    case 'stepper':     return <Stepper view={view} ctx={ctx} />;
    case 'water-level': return <WaterLevelMeter view={view} ctx={ctx} />;
    case 'thermometer': return <ThermometerMeter view={view} ctx={ctx} />;
    case 'number-fill': return <NumberFillMeter view={view} ctx={ctx} />;
    case 'dot-grid':    return <DotGridMeter view={view} ctx={ctx} />;
    case 'microbars':   return <MicrobarsMeter view={view} ctx={ctx} />;
    case 'wedge':       return <WedgeMeter view={view} ctx={ctx} />;
  }
}

function UnknownMeter({ type }: { type: string }) {
  const message = type ? `unknown meter "${type}"` : 'missing meter type';
  return (
    <div style={{
      padding: '4px 8px',
      background: 'rgba(239,68,68,0.15)',
      color: 'var(--bad, #ef4444)',
      borderRadius: 4,
      fontSize: 11,
      fontFamily: 'ui-monospace,monospace',
      lineHeight: 1.3,
    }}>{message}</div>
  );
}

/**
 * Resolve a bound value with the standard precedence:
 *   - `null`/`undefined` → fall back to `fallback`
 *   - string → evaluate as a binding template
 *   - anything else → pass through
 */
export function bind(value: unknown, ctx: RenderContext, fallback?: unknown): unknown {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    const v = evaluateBinding(value, asBindingContext(ctx));
    return v === undefined || v === '' ? fallback ?? v : v;
  }
  return value;
}

/** Resolve a colour binding that may resolve to a panel token name
 *  (`accent`, `warn`, `bad`, `good`, `text`, …) or a CSS colour literal. */
export function bindColor(value: unknown, ctx: RenderContext, fallback = 'currentColor'): string {
  const v = bind(value, ctx, fallback);
  if (typeof v !== 'string') return fallback;
  const trimmed = v.trim();
  if (trimmed.length === 0) return fallback;
  switch (trimmed.toLowerCase()) {
    case 'accent':       return 'var(--accent, currentColor)';
    case 'accent-deep':  return 'var(--accent-deep, var(--accent, currentColor))';
    case 'accent-glow':  return 'var(--accent-glow, var(--accent, currentColor))';
    case 'good':         return 'var(--good, #10b981)';
    case 'warn':         return 'var(--warn, #f59e0b)';
    case 'bad':          return 'var(--bad, #ef4444)';
    case 'text':         return 'var(--text, var(--panel-text, currentColor))';
    case 'text-dim':     return 'var(--text-dim, var(--panel-text-muted, currentColor))';
    case 'text-faded':   return 'var(--text-faded, currentColor)';
    case 'border':       return 'var(--border, currentColor)';
    case 'bg-card':      return 'var(--bg-card, transparent)';
    case 'transparent':  return 'transparent';
    case 'currentcolor': return 'currentColor';
    default:             return trimmed;
  }
}

/** Resolve a numeric binding, returning `fallback` (default 0) for
 *  unparseable values. */
export function bindNumber(value: unknown, ctx: RenderContext, fallback = 0): number {
  const v = bind(value, ctx, fallback);
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  }
  if (v && typeof v === 'object' && 'value' in (v as object)) {
    const inner = (v as { value: unknown }).value;
    if (typeof inner === 'number' && Number.isFinite(inner)) return inner;
  }
  return fallback;
}

/** Resolve a boolean binding. Truthy non-bool values become true.
 *  Bare dotted paths (e.g. `"settings.showCondition"`, `"local.running"`)
 *  are resolved against the context as a convenience for conditional
 *  manifests — `bind`'s template evaluator treats braceless strings as
 *  literals, which would render every bare-path `when` as truthy. */
export function bindBoolean(value: unknown, ctx: RenderContext, fallback = false): boolean {
  const v = bind(value, ctx, fallback);
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    // Looks like `a.b.c` and not a template/literal? Resolve as a path.
    if (/^[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*)+$/.test(v)) {
      const resolved = resolvePath(v, asBindingContext(ctx));
      if (resolved !== undefined) {
        if (typeof resolved === 'boolean') return resolved;
        if (typeof resolved === 'number') return resolved !== 0;
        if (typeof resolved === 'string') return resolved.length > 0 && resolved !== 'false' && resolved !== '0';
        if (resolved === null) return false;
        return Boolean(resolved);
      }
      return false; // path didn't resolve → treat as falsy
    }
    return v.length > 0 && v !== 'false' && v !== '0';
  }
  if (v === null || v === undefined) return fallback;
  return Boolean(v);
}
