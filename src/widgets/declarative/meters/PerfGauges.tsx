// Performance-gauge meter family. Each meter takes a numeric value (0-100 by
// default) plus optional formatted text + label and renders one monitoring
// design, picked by tag.
//
// Common shape (all meters in this file accept these):
//   value:      number 0-100 (the percent for visual fill)
//   formatted:  string — pre-rendered numeric (e.g. "72°C", "1850 RPM")
//   label:      string — short caption ("CPU", "GPU CORE")
//   color:      colour token / CSS literal — accent override
//
// Meters in this file: waterLevel, microbars, dotGrid, numberFill,
// thermometer, wedge. The remaining legacy designs map onto extended
// `bar` / `gauge` / `ring` / `sparkline` primitives.

import type { CSSProperties } from 'react';
import type { WidgetView } from '../../types';
import { bind, bindColor, bindNumber, type RenderContext } from '../renderer';

interface PerfMeterProps { view: WidgetView; ctx: RenderContext; }

// Common style + helper extraction.
function readCommon(view: WidgetView, ctx: RenderContext) {
  const value = bindNumber(view.value, ctx, 0);
  const clamped = Math.max(0, Math.min(100, value));
  const formatted = String(bind(view.formatted, ctx, '') ?? '');
  const label = String(bind(view.label, ctx, '') ?? '');
  const color = bindColor(view.color, ctx, 'var(--accent, var(--panel-accent-glow, currentColor))');
  const trackColor = bindColor(view.trackColor, ctx, 'color-mix(in srgb, var(--panel-text, currentColor) 12%, transparent)');
  return { value, clamped, formatted, label, color, trackColor };
}

function ValueLabelStack({ formatted, label, style }: {
  formatted: string; label: string;
  style?: CSSProperties;
}) {
  if (!formatted && !label) return null;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 1, minWidth: 0, ...style,
    }}>
      {formatted && (
        <span style={{
          fontSize: 'clamp(14px, 7cqi, 20px)',
          fontWeight: 700, lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
          maxWidth: '100%',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: 'var(--text, var(--panel-text, currentColor))',
        }}>{formatted}</span>
      )}
      {label && (
        <span style={{
          fontSize: 'clamp(9px, 3.5cqi, 11px)',
          fontWeight: 500,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          opacity: 0.55,
          maxWidth: '100%',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{label}</span>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// waterLevel — vertical bar with fill rising from the bottom + overlay text.
// Use when you want a literal "tank fills as value rises" metaphor.
// ────────────────────────────────────────────────────────────────────────

export function WaterLevelMeter({ view, ctx }: PerfMeterProps) {
  const { clamped, formatted, label, color, trackColor } = readCommon(view, ctx);
  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      minWidth: 0, minHeight: 0,
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        borderRadius: 10, overflow: 'hidden',
        background: trackColor,
      }}>
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          height: `${clamped}%`,
          background: `linear-gradient(180deg, color-mix(in srgb, ${color} 75%, transparent), ${color})`,
          transition: 'height 380ms cubic-bezier(0.3,0,0.2,1)',
        }} />
      </div>
      <div style={{
        position: 'relative', flex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <ValueLabelStack formatted={formatted} label={label} />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// thermometer — vertical bulb + stem, bulb always lit at the bottom.
// Pairs with a value + label to the right of the tube.
// ────────────────────────────────────────────────────────────────────────

export function ThermometerMeter({ view, ctx }: PerfMeterProps) {
  const { clamped, formatted, label, color, trackColor } = readCommon(view, ctx);
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', alignItems: 'stretch',
      gap: 'clamp(6px, 3cqi, 12px)', padding: 'clamp(6px, 3cqi, 12px)',
      minWidth: 0, minHeight: 0, boxSizing: 'border-box',
    }}>
      <div style={{
        position: 'relative', width: 'clamp(10px, 6cqi, 16px)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        <div style={{
          flex: 1, width: '60%', position: 'relative',
          background: trackColor,
          borderTopLeftRadius: 999, borderTopRightRadius: 999,
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            height: `${clamped}%`,
            background: color,
            transition: 'height 380ms cubic-bezier(0.3,0,0.2,1)',
          }} />
        </div>
        <div style={{
          width: '100%', aspectRatio: '1 / 1',
          borderRadius: '50%', background: color,
          marginTop: -2,
        }} />
      </div>
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
        minWidth: 0,
      }}>
        <ValueLabelStack formatted={formatted} label={label} style={{ alignItems: 'flex-start' }} />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// numberFill — large numeric reading with a vertical fill mask behind it.
// The dim copy underlays a bright copy that's clipped from the top so the
// reading "fills up" as the value rises. Square-root mapping so single-
// digit changes still produce visible movement.
// ────────────────────────────────────────────────────────────────────────

export function NumberFillMeter({ view, ctx }: PerfMeterProps) {
  const { clamped, formatted, label, color } = readCommon(view, ctx);
  const display = clamped <= 0 ? 0 : Math.sqrt(clamped / 100) * 100;
  const clipTop = 100 - display;
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 'clamp(6px, 2.5cqi, 14px)', minWidth: 0, minHeight: 0,
      boxSizing: 'border-box', gap: 4,
    }}>
      <div style={{
        position: 'relative', display: 'inline-block',
        fontSize: 'clamp(28px, 16cqi, 64px)',
        fontWeight: 800, lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.02em',
      }}>
        <span style={{ opacity: 0.28, color: 'var(--text, currentColor)' }}>{formatted || '—'}</span>
        <span style={{
          position: 'absolute', left: 0, top: 0,
          color,
          clipPath: `inset(${clipTop}% 0 0 0)`,
          transition: 'clip-path 380ms cubic-bezier(0.3,0,0.2,1)',
        }} aria-hidden="true">{formatted || '—'}</span>
      </div>
      {label && (
        <span style={{
          fontSize: 'clamp(9px, 3cqi, 11px)',
          fontWeight: 500, letterSpacing: '0.06em',
          textTransform: 'uppercase', opacity: 0.55,
        }}>{label}</span>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// dotGrid — N×M grid of dots, filled count tracks value. Filling starts
// from the bottom row, left-to-right within each row.
// ────────────────────────────────────────────────────────────────────────

export function DotGridMeter({ view, ctx }: PerfMeterProps) {
  const { clamped, formatted, label, color, trackColor } = readCommon(view, ctx);
  const cols = Math.max(1, bindNumber(view.cols, ctx, 5));
  const rows = Math.max(1, bindNumber(view.rows, ctx, 5));
  const total = cols * rows;
  const filled = Math.round(clamped / 100 * total);
  const cells: React.ReactElement[] = [];
  for (let i = 0; i < total; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const fromBottom = (rows - 1 - row) * cols + col;
    const on = fromBottom < filled;
    cells.push(
      <div key={i} style={{
        aspectRatio: '1 / 1',
        background: on ? color : trackColor,
        borderRadius: '50%',
        opacity: on ? 1 : 0.5,
        transition: 'background-color 90ms ease, opacity 90ms ease',
      }} />
    );
  }
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 'clamp(4px, 2cqi, 10px)', gap: 'clamp(4px, 2cqi, 8px)',
      minWidth: 0, minHeight: 0, boxSizing: 'border-box',
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gap: 'clamp(2px, 1.2cqi, 5px)',
        width: 'min(60cqw, 60cqh, 120px)',
        aspectRatio: `${cols} / ${rows}`,
      }}>{cells}</div>
      <ValueLabelStack formatted={formatted} label={label} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// microbars — last N samples of a history buffer rendered as a row of
// small vertical bars. Pairs with the formatted reading + label below.
// Needs `history` (number[]) — use the sparkline data source convention.
// ────────────────────────────────────────────────────────────────────────

export function MicrobarsMeter({ view, ctx }: PerfMeterProps) {
  const { formatted, label, color, trackColor } = readCommon(view, ctx);
  const count = Math.max(1, bindNumber(view.count, ctx, 10));
  const rawHistory = bind(view.history, ctx);
  const history = Array.isArray(rawHistory) ? rawHistory.filter((v) => typeof v === 'number') as number[] : [];
  const bars = history.slice(-count);
  while (bars.length < count) bars.unshift(0);
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex',
      flexDirection: 'column', alignItems: 'stretch',
      padding: 'clamp(4px, 2cqi, 10px)', gap: 'clamp(2px, 1cqi, 6px)',
      minWidth: 0, minHeight: 0, boxSizing: 'border-box',
    }}>
      <div style={{
        flex: 1, display: 'flex', alignItems: 'flex-end',
        gap: 'clamp(1.5px, 0.6cqw, 4px)',
        background: 'transparent',
        minHeight: 0,
      }}>
        {bars.map((v, i) => (
          <div key={i} style={{
            flex: 1, minWidth: 0,
            height: `${Math.max(6, Math.min(100, v))}%`,
            background: color, borderRadius: 2,
            opacity: 0.85,
            transition: 'height 220ms cubic-bezier(0.3,0,0.2,1)',
          }} />
        ))}
      </div>
      {(formatted || label) && (
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          gap: 6, minWidth: 0,
        }}>
          {formatted && (
            <span style={{
              fontSize: 'clamp(13px, 6cqi, 18px)', fontWeight: 700, lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--text, currentColor)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{formatted}</span>
          )}
          {label && (
            <span style={{
              fontSize: 'clamp(9px, 3cqi, 11px)', fontWeight: 500,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              opacity: 0.55,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{label}</span>
          )}
        </div>
      )}
      {void trackColor}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// wedge — pie wedge that fills clockwise from 12 o'clock as value rises.
// Same visual family as the legacy WedgeGauge.
// ────────────────────────────────────────────────────────────────────────

export function WedgeMeter({ view, ctx }: PerfMeterProps) {
  const { clamped, formatted, label, color, trackColor } = readCommon(view, ctx);
  const path = wedgePath(clamped);
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 4, padding: 'clamp(4px, 2cqi, 10px)',
      minWidth: 0, minHeight: 0, boxSizing: 'border-box',
    }}>
      <svg
        viewBox="0 0 100 100"
        style={{ width: 'min(70cqw, 70cqh)', height: 'min(70cqw, 70cqh)' }}
        aria-hidden="true"
      >
        <circle cx="50" cy="50" r="36" fill={trackColor} />
        {path && <path d={path} fill={color} style={{ transition: 'd 220ms cubic-bezier(0.3,0,0.2,1)' }} />}
      </svg>
      <ValueLabelStack formatted={formatted} label={label} />
    </div>
  );
}

function wedgePath(percent: number): string {
  if (percent <= 0) return '';
  if (percent >= 100) {
    // Two half-arc circles to avoid the M-A-Z degeneracy when end == start.
    const top = polar(-90, 36);
    const bottom = polar(90, 36);
    return `M ${top.x.toFixed(3)} ${top.y.toFixed(3)} A 36 36 0 0 1 ${bottom.x.toFixed(3)} ${bottom.y.toFixed(3)} A 36 36 0 0 1 ${top.x.toFixed(3)} ${top.y.toFixed(3)} Z`;
  }
  const startAngle = -90;
  const endAngle = startAngle + (percent / 100) * 360;
  const start = polar(startAngle, 36);
  const end = polar(endAngle, 36);
  const largeArc = percent > 50 ? 1 : 0;
  return `M 50 50 L ${start.x.toFixed(3)} ${start.y.toFixed(3)} A 36 36 0 ${largeArc} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)} Z`;
}

function polar(angleDeg: number, radius: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: 50 + radius * Math.cos(rad), y: 50 + radius * Math.sin(rad) };
}
