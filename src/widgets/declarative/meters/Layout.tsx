import type { CSSProperties, ReactNode } from 'react';
import type { WidgetView } from '../../types';
import { bind, bindBoolean, bindColor, bindNumber, renderView, type RenderContext } from '../renderer';

interface MeterProps { view: WidgetView; ctx: RenderContext; }

function children(view: WidgetView, ctx: RenderContext): ReactNode[] {
  const raw = view.children;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v): v is WidgetView => !!v && typeof v === 'object' && typeof (v as WidgetView).type === 'string')
    .map((child, i) => <ChildSlot key={i}>{renderView(child, ctx)}</ChildSlot>);
}

function ChildSlot({ children }: { children: ReactNode }) {
  // Layout meters wrap each child so flex / grid gap applies cleanly.
  return <>{children}</>;
}

function pxOrUndefined(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
}

function commonStyle(view: WidgetView, ctx: RenderContext): CSSProperties {
  const padding = bind(view.padding, ctx);
  const gap = pxOrUndefined(bind(view.gap, ctx)) ?? 6;
  // `grow` lets a child claim the remaining vertical/horizontal space in
  // its parent flex container. Equivalent to `flex: 1; flex-basis: 0;`,
  // which is how the original handcrafted widgets sized lists that filled
  // their card. Without it, lists render at natural height and clip if the
  // container is shorter than the sum of items.
  const grow = bindBoolean(view.grow, ctx, false);
  return {
    padding: padding == null ? undefined : (typeof padding === 'number' ? padding : String(padding)),
    gap,
    alignItems: typeof view.align === 'string' ? bind(view.align, ctx) as string : undefined,
    justifyContent: typeof view.justify === 'string' ? bind(view.justify, ctx) as string : undefined,
    flex: grow ? '1 1 0' : undefined,
    minHeight: grow ? 0 : undefined,
  };
}

export function VStack({ view, ctx }: MeterProps) {
  // Default to natural height + full width. Setting `height: 100%` here
  // breaks nested layouts: every vstack would fight for full height and
  // flex-shrink compresses each to a fraction. Use `grow: true` to opt in
  // to filling — only the outermost vstack of a view typically needs it.
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      minHeight: 0,
      ...commonStyle(view, ctx),
    }}>
      {children(view, ctx)}
    </div>
  );
}

export function HStack({ view, ctx }: MeterProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'row',
      width: '100%',
      minWidth: 0,
      ...commonStyle(view, ctx),
    }}>
      {children(view, ctx)}
    </div>
  );
}

export function Grid({ view, ctx }: MeterProps) {
  const cols = bindNumber(view.columns, ctx, 2);
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      width: '100%',
      height: '100%',
      minHeight: 0,
      ...commonStyle(view, ctx),
    }}>
      {children(view, ctx)}
    </div>
  );
}

export function Frame({ view, ctx }: MeterProps) {
  const fill = bindColor(view.fill, ctx, 'transparent');
  const border = bindColor(view.border, ctx, 'transparent');
  const radius = pxOrUndefined(bind(view.radius, ctx)) ?? 8;
  const padding = pxOrUndefined(bind(view.padding, ctx)) ?? 8;
  const innerChild = view.child as WidgetView | undefined;
  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: fill,
      border: border === 'transparent' ? 'none' : `1px solid ${border}`,
      borderRadius: radius,
      padding,
      boxSizing: 'border-box',
      display: 'flex',
    }}>
      {innerChild ? renderView(innerChild, ctx) : children(view, ctx)}
    </div>
  );
}

export function Divider({ view, ctx }: MeterProps) {
  const orientation = (bind(view.orientation, ctx) as string) ?? 'horizontal';
  const color = bindColor(view.color, ctx, 'var(--border, rgba(255,255,255,0.12))');
  if (orientation === 'vertical') {
    return <div style={{ width: 1, alignSelf: 'stretch', background: color, opacity: 0.6 }} />;
  }
  return <div style={{ height: 1, width: '100%', background: color, opacity: 0.6 }} />;
}

export function Spacer({ view, ctx }: MeterProps) {
  const size = pxOrUndefined(bind(view.size, ctx));
  if (size == null) {
    return <div style={{ flex: 1 }} />;
  }
  return <div style={{ width: size, height: size, flexShrink: 0 }} />;
}

export function Conditional({ view, ctx }: MeterProps) {
  const cond = bindBoolean(view.when, ctx, false);
  const branch = (cond ? view.then : view.else) as WidgetView | undefined;
  return <>{branch ? renderView(branch, ctx) : null}</>;
}

/**
 * Multi-way switch on a bound value. Drives the "design picker" pattern
 * shared by Clock (digital/analog/led/...), Lighting (mode preview),
 * Cooling (profile preview) etc.
 *
 * Manifest shape:
 *   { "type": "switch", "value": "{settings.design}",
 *     "cases": { "digital": {...view...}, "analog": {...view...} },
 *     "default": {...optional fallback...} }
 *
 * The bound value is coerced to a string and matched against `cases` keys.
 * No match + no `default` renders nothing.
 */
export function Switch({ view, ctx }: MeterProps) {
  const raw = bind(view.value, ctx, '');
  const key = raw == null ? '' : String(raw);
  const cases = (view.cases ?? {}) as Record<string, WidgetView>;
  const branch = (cases[key] ?? (view.default as WidgetView | undefined)) as WidgetView | undefined;
  return <>{branch ? renderView(branch, ctx) : null}</>;
}

/**
 * Fixed-dimension slot. Useful for grid-style row layouts (day | icon | bar)
 * where each column needs a hard width to align cleanly across rows.
 * Renders its `child` (or `children`) inside a flex container that doesn't
 * shrink below the declared size.
 */
export function Box({ view, ctx }: MeterProps) {
  const width = pxOrUndefined(bind(view.width, ctx));
  const height = pxOrUndefined(bind(view.height, ctx));
  const align = (bind(view.align, ctx) as string) ?? 'center';
  const justify = (bind(view.justify, ctx) as string) ?? 'center';
  const innerChild = view.child as WidgetView | undefined;
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'row',
      alignItems: align,
      justifyContent: justify,
      width,
      height,
      flexShrink: 0,
      minWidth: 0,
    }}>
      {innerChild ? renderView(innerChild, ctx) : children(view, ctx)}
    </div>
  );
}

/**
 * Iterate an array (from data, settings, or a literal) and render the
 * `template` view for each entry. Within the template, `{item.x}` resolves
 * against the current array element and `{index}` is the 0-based index.
 *
 * Manifest shape:
 *   { type: "repeat", in: "{data.weather.hourly}", limit: 6, gap: 6,
 *     direction: "horizontal" | "vertical",
 *     template: { type: "vstack", children: [...] },
 *     empty: { type: "text", text: "no data" } }
 */
export function Repeat({ view, ctx }: MeterProps) {
  const source = bind(view.in, ctx);
  const items = Array.isArray(source) ? source : [];
  const template = view.template as WidgetView | undefined;
  const empty = view.empty as WidgetView | undefined;
  const limit = pxOrUndefined(bind(view.limit, ctx));
  const sliced = limit != null ? items.slice(0, Math.max(0, limit)) : items;
  const direction = (typeof view.direction === 'string' ? view.direction : 'horizontal') as
    | 'horizontal' | 'vertical';

  if (sliced.length === 0) {
    return <>{empty ? renderView(empty, ctx) : null}</>;
  }
  if (!template) return null;

  return (
    <div style={{
      display: 'flex',
      flexDirection: direction === 'vertical' ? 'column' : 'row',
      width: '100%',
      minWidth: 0,
      minHeight: 0,
      ...commonStyle(view, ctx),
    }}>
      {sliced.map((item, i) => {
        // Compose a per-item context. The original data/settings/widgetId
        // are preserved so children can still reach the parent scope.
        const childCtx: RenderContext = {
          ...ctx,
          data: { ...ctx.data, item, index: i },
        };
        return <ChildSlot key={i}>{renderView(template, childCtx)}</ChildSlot>;
      })}
    </div>
  );
}
