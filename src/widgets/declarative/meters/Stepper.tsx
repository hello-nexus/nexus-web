// Stepper meter: ▲ value ▼ column that mutates one widget-local key.
// Wraps min↔max. Used by the timer setup phase but generic enough for any
// "pick a small integer" UI.
//
// Manifest shape:
//   { "type": "stepper",
//     "key": "hours",          // local state key to read + mutate
//     "min": 0, "max": 23,
//     "step": 1,               // default 1
//     "pad": 2,                // zero-pad digits; 0 = no padding (default 2)
//     "size": 24,              // value font size in px
//     "iconSize": 14,          // chevron size in px
//     "weight": "bold",
//     "color": "currentColor"  // color token or CSS literal
//   }

import { ChevronUp, ChevronDown } from 'lucide-react';
import type { WidgetView } from '../../types';
import { bind, bindColor, bindNumber, type RenderContext } from '../renderer';

interface MeterProps { view: WidgetView; ctx: RenderContext; }

export function Stepper({ view, ctx }: MeterProps) {
  const key = String(bind(view.key, ctx, '') ?? '');
  const min = bindNumber(view.min, ctx, 0);
  const max = bindNumber(view.max, ctx, 99);
  const step = bindNumber(view.step, ctx, 1) || 1;
  const pad = bindNumber(view.pad, ctx, 2);
  const size = bindNumber(view.size, ctx, 24);
  const iconSize = bindNumber(view.iconSize, ctx, 14);
  const color = bindColor(view.color, ctx, 'currentColor');
  const weight = String(bind(view.weight, ctx, 'bold') ?? 'bold');

  const current = clampToRange(toNumber(ctx.local?.[key]), min, max);

  // Not memoised: the chevron buttons aren't memo'd children, so wrapping
  // this in useCallback would add bookkeeping without saving a render.
  const mutate = (delta: number) => {
    if (!key || !ctx.onLocalUpdate) return;
    const span = max - min + 1;
    const raw = current + delta;
    const wrapped = ((raw - min) % span + span) % span + min;
    ctx.onLocalUpdate({ [key]: wrapped }, ctx);
  };

  const displayValue = pad > 0 ? String(current).padStart(pad, '0') : String(current);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 2, minWidth: 0,
    }}>
      <button type="button"
        onClick={() => mutate(step)}
        aria-label={`Increase ${key || 'value'}`}
        style={chevronButtonStyle(color, iconSize)}
      >
        <ChevronUp size={iconSize} aria-hidden="true" />
      </button>
      <span style={{
        fontSize: size, fontWeight: weight as React.CSSProperties['fontWeight'],
        fontVariantNumeric: 'tabular-nums', lineHeight: 1, color,
        userSelect: 'none',
      }}>
        {displayValue}
      </span>
      <button type="button"
        onClick={() => mutate(-step)}
        aria-label={`Decrease ${key || 'value'}`}
        style={chevronButtonStyle(color, iconSize)}
      >
        <ChevronDown size={iconSize} aria-hidden="true" />
      </button>
    </div>
  );
}

function toNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function clampToRange(v: number, min: number, max: number): number {
  if (v < min) return min;
  if (v > max) return max;
  return Math.round(v);
}

function chevronButtonStyle(color: string, iconSize: number): React.CSSProperties {
  const padding = Math.max(2, Math.round(iconSize * 0.25));
  return {
    background: 'transparent',
    border: 'none',
    color,
    padding,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
    opacity: 0.75,
    transition: 'opacity 120ms ease',
    lineHeight: 0,
  };
}
