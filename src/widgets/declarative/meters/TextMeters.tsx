import type { CSSProperties } from 'react';
import type { WidgetView } from '../../types';
import { bind, bindBoolean, bindColor, bindNumber, type RenderContext } from '../renderer';
import { scopedFontName } from '../fontLoader';

interface MeterProps { view: WidgetView; ctx: RenderContext; }

const WEIGHT_MAP: Record<string, number> = {
  thin: 200, light: 300, regular: 400, medium: 500,
  semibold: 600, bold: 700, black: 900,
};

function textStyle(view: WidgetView, ctx: RenderContext, defaults: CSSProperties): CSSProperties {
  // `size` is a number (px) or a string ("2.6em", "clamp(...)"). Numbers go
  // through bindNumber, strings through bind (binding expressions resolve);
  // strings pass to CSS verbatim.
  const rawSize = bind(view.size, ctx);
  let fontSizeValue: number | string | undefined;
  if (typeof rawSize === 'number' && Number.isFinite(rawSize)) {
    fontSizeValue = rawSize;
  } else if (typeof rawSize === 'string' && rawSize.length > 0) {
    fontSizeValue = rawSize;
  }
  const tabular = bindBoolean(view.tabular, ctx, false);
  const weight = bind(view.weight, ctx) as string | undefined;
  const align = (bind(view.align, ctx) as string) ?? 'center';
  const color = bindColor(view.color, ctx, defaults.color as string ?? 'currentColor');
  const width = bindNumber(view.width, ctx, NaN);
  const opacity = bindNumber(view.opacity, ctx, NaN);
  const truncate = bindBoolean(view.truncate, ctx, false);
  const transform = bind(view.transform, ctx) as string | undefined;
  // `font` = author-bundled name → the widget-scoped family from fontLoader,
  // falling through to system font until loaded (no FOUT block). `fontFamily`
  // = a raw CSS family list for a system generic with no bundled asset.
  const font = bind(view.font, ctx) as string | undefined;
  const fontFamilyRaw = bind(view.fontFamily, ctx) as string | undefined;
  let fontFamily: CSSProperties['fontFamily'] = defaults.fontFamily;
  if (font) {
    fontFamily = `"${scopedFontName(ctx.widgetId, String(font))}", ${(defaults.fontFamily as string | undefined) ?? 'inherit'}`;
  } else if (fontFamilyRaw) {
    fontFamily = String(fontFamilyRaw);
  }
  const letterSpacingOverride = bind(view.letterSpacing, ctx);
  const lineHeightOverride = bind(view.lineHeight, ctx);
  return {
    ...defaults,
    color,
    fontSize: fontSizeValue ?? defaults.fontSize,
    // Number(weight) is NaN for non-numeric input (never nullish), so `||`
    // coerces NaN → 400. WEIGHT_MAP keyword | numeric string | 400.
    fontWeight: weight ? (WEIGHT_MAP[weight] ?? (Number(weight) || 400)) : defaults.fontWeight,
    fontFamily,
    textAlign: align as CSSProperties['textAlign'],
    fontVariantNumeric: tabular ? 'tabular-nums' : defaults.fontVariantNumeric,
    lineHeight: lineHeightOverride == null
      ? defaults.lineHeight
      : (typeof lineHeightOverride === 'number'
          ? lineHeightOverride
          : String(lineHeightOverride)),
    letterSpacing: letterSpacingOverride == null
      ? defaults.letterSpacing
      : (typeof letterSpacingOverride === 'number'
          ? `${letterSpacingOverride}em`
          : String(letterSpacingOverride)),
    textTransform: (transform === 'none' || transform === 'uppercase' || transform === 'lowercase' || transform === 'capitalize')
      ? transform
      : defaults.textTransform,
    width: Number.isFinite(width) ? width : undefined,
    flexShrink: Number.isFinite(width) ? 0 : undefined,
    opacity: Number.isFinite(opacity) ? opacity : undefined,
    overflow: truncate ? 'hidden' : undefined,
    textOverflow: truncate ? 'ellipsis' : undefined,
    whiteSpace: truncate ? 'nowrap' : undefined,
  };
}

export function Text({ view, ctx }: MeterProps) {
  const text = String(bind(view.text, ctx, '') ?? '');
  return (
    <div style={textStyle(view, ctx, {
      color: 'var(--text-dim, var(--panel-text-muted, rgba(245,245,245,0.65)))',
      fontSize: 'clamp(11px, 4cqi, 13px)',
      fontWeight: 500,
      lineHeight: 1.3,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
    })}>{text}</div>
  );
}

export function Value({ view, ctx }: MeterProps) {
  // Primary numeric display: container-query scaling, tabular digits, tight
  // letter-spacing. Optional `unit` renders as a smaller suffix; pre-format
  // the number in `text` (no separate format string).
  const text = String(bind(view.text, ctx, '--') ?? '--');
  const unit = bind(view.unit, ctx) as string | undefined;
  return (
    <div style={textStyle(view, ctx, {
      color: 'var(--text, var(--panel-text, currentColor))',
      fontSize: 'clamp(20px, 14cqi, 64px)',
      fontWeight: 600,
      lineHeight: 1.05,
      letterSpacing: '-0.02em',
      fontVariantNumeric: 'tabular-nums',
    })}>
      {text}
      {unit ? <span style={{ fontSize: '0.55em', marginLeft: 2, opacity: 0.75 }}>{unit}</span> : null}
    </div>
  );
}

export function Badge({ view, ctx }: MeterProps) {
  const text = String(bind(view.text, ctx, '') ?? '');
  const color = bindColor(view.color, ctx, 'var(--accent, currentColor)');
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '2px 8px',
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 500,
      lineHeight: 1,
      background: `color-mix(in srgb, ${color} 18%, transparent)`,
      color,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    }}>{text}</span>
  );
}
