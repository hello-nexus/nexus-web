// Button meter: click target that fires a dispatch action. The button's
// surface fits the parent flex cell (so a macros widget at 2x2 gets a
// full-card button) and renders a single child view inside as its label.
//
// Manifest shape:
//   { "type": "button",
//     "child": { "type": "icon", "name": "play", "size": 28 },
//     "color": "accent",                  // optional tint, default subtle
//     "onClick": { "action": "macros.launchApp",
//                  "args": { "appId": "{settings.appId}" } } }

import { useCallback, useState } from 'react';
import type { WidgetView } from '../../types';
import { bind, bindBoolean, bindColor, renderView, type RenderContext } from '../renderer';
import { dispatchWidgetAction, type WidgetAction } from '../dispatch';

interface ButtonClickSpec {
  /** Host dispatch action. Routed through /widgets-api/dispatch and
   *  gated by the manifest's `capabilities.dispatch` allowlist. */
  action?: string;
  args?: Record<string, unknown>;
  /** Widget-local state mutation. Runs client-side and persists per
   *  (widgetId, instanceId) via the `useWidgetLocalState` hook. */
  localUpdate?: Record<string, unknown>;
}

interface MeterProps { view: WidgetView; ctx: RenderContext; }

export function Button({ view, ctx }: MeterProps) {
  const [pressed, setPressed] = useState(false);
  const child = view.child as WidgetView | undefined;
  const disabled = bindBoolean(view.disabled, ctx, false);
  const color = bindColor(view.color, ctx, 'var(--accent, currentColor)');
  const ariaLabel = String(bind(view.label, ctx, '') ?? '');

  const onClick = useCallback((event: React.MouseEvent | React.PointerEvent) => {
    if (disabled) return;
    event.stopPropagation();
    setPressed(true);
    window.setTimeout(() => setPressed(false), 140);
    const spec = view.onClick as ButtonClickSpec | undefined;
    if (!spec || typeof spec !== 'object') return;
    // Local mutation runs first so the host dispatch sees post-mutation state.
    // A button may declare either or both (e.g. set `pending: true` + fire a
    // server action).
    if (spec.localUpdate && ctx.onLocalUpdate) {
      ctx.onLocalUpdate(spec.localUpdate, ctx);
    }
    if (spec.action) {
      void dispatchWidgetAction(ctx.widgetId, spec as WidgetAction, ctx);
    }
  }, [ctx, view.onClick, disabled]);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel || undefined}
      style={{
        // Fill the parent for a full-card hit area.
        flex: '1 1 0',
        width: '100%', height: '100%',
        minWidth: 0, minHeight: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 8,
        background: pressed
          ? `color-mix(in srgb, ${color} 28%, transparent)`
          : 'color-mix(in srgb, var(--panel-text, currentColor) 6%, transparent)',
        color: 'var(--text, var(--panel-text, currentColor))',
        border: '1px solid var(--border, color-mix(in srgb, var(--panel-text, currentColor) 14%, transparent))',
        borderRadius: 12,
        padding: 8,
        font: 'inherit',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 150ms ease, transform 90ms ease',
        transform: pressed ? 'scale(0.97)' : 'scale(1)',
        boxSizing: 'border-box',
      }}
    >
      {child ? renderView(child, ctx) : null}
    </button>
  );
}
