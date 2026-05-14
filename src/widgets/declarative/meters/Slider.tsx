// Interactive slider meter. The author binds `value` to a data source +
// declares an `onChange` action that fires on drag (throttled) and an
// `onCommit` action that fires on release. Both actions are dispatched
// through the host's widget RPC channel (validated against the manifest's
// capabilities.dispatch allowlist).
//
// Manifest shape:
//   { "type": "slider",
//     "value": "{data.brightness}",   // current value (number)
//     "min": 0, "max": 100,
//     "color": "accent",              // optional fill colour
//     "trackColor": "border",
//     "onChange": { "action": "displays.setBrightness",
//                   "args": { "id": "{data.item.id}", "value": "{value}" } },
//     "onCommit": { "action": "displays.setBrightness",
//                   "args": { "id": "{data.item.id}", "value": "{value}" } } }
//
// Optimistic UI: local `value` state shadows the bound prop while the
// user is dragging so the thumb tracks the finger immediately and the
// server-confirmed value catches up via the data source.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WidgetView } from '../../types';
import { bind, bindColor, bindNumber, type RenderContext } from '../renderer';
import { dispatchWidgetAction, type WidgetAction } from '../dispatch';

interface MeterProps { view: WidgetView; ctx: RenderContext; }

export function Slider({ view, ctx }: MeterProps) {
  const min = bindNumber(view.min, ctx, 0);
  const max = bindNumber(view.max, ctx, 100);
  const boundValue = bindNumber(view.value, ctx, min);
  const disabled = !!bind(view.disabled, ctx);
  const color = bindColor(view.color, ctx, 'var(--accent, currentColor)');
  const trackColor = bindColor(view.trackColor, ctx, 'color-mix(in srgb, var(--panel-text, currentColor) 14%, transparent)');
  const ariaLabel = String(bind(view.label, ctx, '') ?? '');
  const orientation = (bind(view.orientation, ctx) as string) === 'vertical' ? 'vertical' : 'horizontal';
  const segments = Math.max(0, bindNumber(view.segments, ctx, 0));

  // Optimistic local value. We follow the bound value when the user
  // isn't dragging; once they touch the slider, local state takes over
  // until the next bound value lands matching the committed target.
  const [local, setLocal] = useState(boundValue);
  const draggingRef = useRef(false);
  const lastCommittedRef = useRef(boundValue);
  useEffect(() => {
    // Sync to upstream when not dragging AND the upstream value matches
    // what we last committed (server confirmed). This avoids snapping
    // back mid-drag if a polled data source races the commit.
    if (!draggingRef.current && Math.abs(boundValue - lastCommittedRef.current) < 0.5) {
      setLocal(boundValue);
    }
  }, [boundValue]);

  const dispatchChange = useCallback((rawValue: number, kind: 'change' | 'commit') => {
    const spec = (kind === 'commit' ? view.onCommit : view.onChange) as WidgetAction | undefined;
    if (!spec) return;
    // Compose a binding context augmented with `value` so the manifest's
    // {value} placeholder in args resolves to the slider's current target.
    const augmented = {
      ...ctx,
      data: { ...ctx.data, value: rawValue },
    };
    void dispatchWidgetAction(ctx.widgetId, spec, augmented);
  }, [ctx, view.onChange, view.onCommit]);

  const onPointerDown = () => {
    if (disabled) return;
    draggingRef.current = true;
  };
  const onInput: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const v = Number(e.target.value);
    setLocal(v);
    dispatchChange(v, 'change');
  };
  const onPointerUp = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    lastCommittedRef.current = local;
    dispatchChange(local, 'commit');
  };

  const pct = max === min ? 0 : Math.max(0, Math.min(1, (local - min) / (max - min)));

  if (orientation === 'vertical') {
    return (
      <VerticalSlider
        min={min} max={max} pct={pct} segments={segments}
        color={color} trackColor={trackColor}
        disabled={disabled} ariaLabel={ariaLabel}
        local={local}
        onPointerDown={onPointerDown}
        onInput={onInput}
        onPointerUp={onPointerUp}
        dragging={draggingRef.current}
      />
    );
  }

  return (
    <div style={{
      width: '100%',
      display: 'flex', alignItems: 'center',
      minWidth: 0, position: 'relative',
    }}>
      <div style={{
        position: 'absolute', left: 0, right: 0, top: '50%',
        transform: 'translateY(-50%)',
        height: 6, borderRadius: 999,
        background: trackColor,
        pointerEvents: 'none',
      }}>
        <div style={{
          position: 'absolute', top: 0, bottom: 0, left: 0,
          width: `${pct * 100}%`,
          background: color,
          borderRadius: 999,
          opacity: disabled ? 0.35 : 1,
          transition: draggingRef.current ? 'none' : 'width 220ms cubic-bezier(0.3,0,0.2,1)',
        }} />
      </div>
      <input
        type="range"
        min={min} max={max} step={1}
        value={local}
        disabled={disabled}
        onChange={onInput}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onTouchEnd={onPointerUp}
        aria-label={ariaLabel || undefined}
        style={{
          width: '100%', height: 28, opacity: 0, position: 'relative', zIndex: 1,
          cursor: disabled ? 'not-allowed' : 'pointer', margin: 0,
        }}
      />
    </div>
  );
}

// Vertical mixer-strip variant. When `segments > 0` the track renders as
// a stack of N discrete slats (bottom-fills as value rises); otherwise a
// continuous bar. Hidden <input type="range"> overlay does the actual
// dragging — we map clientY → pct so a tap anywhere on the strip jumps
// the value, matching the legacy PanelMixerSlider behaviour.
function VerticalSlider({
  min, max, pct, segments, color, trackColor, disabled, ariaLabel,
  local, onPointerDown, onInput, onPointerUp, dragging,
}: {
  min: number; max: number; pct: number; segments: number;
  color: string; trackColor: string; disabled: boolean; ariaLabel: string;
  local: number;
  onPointerDown: () => void;
  onInput: React.ChangeEventHandler<HTMLInputElement>;
  onPointerUp: () => void;
  dragging: boolean;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const hitToValue = (clientY: number): number => {
    const el = trackRef.current;
    if (!el) return local;
    const rect = el.getBoundingClientRect();
    const y = Math.max(rect.top, Math.min(rect.bottom, clientY));
    const fromBottom = (rect.bottom - y) / rect.height;
    return Math.round(min + fromBottom * (max - min));
  };
  const onTrackPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    onPointerDown();
    const v = hitToValue(e.clientY);
    // Synthesise an input event so the existing optimistic loop fires.
    const synthEvent = { target: { value: String(v) } } as unknown as React.ChangeEvent<HTMLInputElement>;
    onInput(synthEvent);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onTrackPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const v = hitToValue(e.clientY);
    const synthEvent = { target: { value: String(v) } } as unknown as React.ChangeEvent<HTMLInputElement>;
    onInput(synthEvent);
  };

  // Segmented render: discrete slats (mixer-style).
  const segmentList: React.ReactElement[] = [];
  if (segments > 0) {
    for (let i = 0; i < segments; i++) {
      // Segment i counts from the bottom (i=0 at bottom). It's "active"
      // when value/range ≥ (i+1)/segments threshold.
      const threshold = (i + 1) / segments;
      const active = pct >= threshold - 0.0001;
      segmentList.unshift(
        <div key={i} style={{
          flex: 1, minHeight: 2,
          background: active ? color : trackColor,
          borderRadius: 2,
          opacity: active ? (disabled ? 0.35 : 1) : 0.5,
          transition: dragging ? 'none' : 'background-color 90ms ease, opacity 90ms ease',
          boxShadow: active ? 'inset 0 1px 0 color-mix(in srgb, white 18%, transparent)'
                             : 'inset 0 1px 0 color-mix(in srgb, white 10%, transparent)',
        }} />
      );
    }
  }

  return (
    <div
      ref={trackRef}
      onPointerDown={onTrackPointerDown}
      onPointerMove={onTrackPointerMove}
      onPointerUp={(e) => {
        try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
        onPointerUp();
      }}
      onPointerCancel={onPointerUp}
      role="slider"
      aria-label={ariaLabel || undefined}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={local}
      aria-disabled={disabled || undefined}
      aria-orientation="vertical"
      style={{
        width: '100%', height: '100%', minHeight: 60,
        display: 'flex', flexDirection: 'column',
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {segments > 0 ? (
        // Mixer-strip frame around the segment stack.
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 4,
          width: '100%', flex: 1, minHeight: 0,
          padding: '6px 5px', boxSizing: 'border-box',
          background: 'color-mix(in srgb, var(--panel-text, currentColor) 6%, transparent)',
          borderRadius: 8,
        }}>
          {segmentList}
        </div>
      ) : (
        // Continuous vertical bar.
        <div style={{
          position: 'relative', flex: 1, minHeight: 0,
          width: 8, alignSelf: 'center',
          background: trackColor, borderRadius: 999, overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            height: `${pct * 100}%`, background: color,
            borderRadius: 999,
            opacity: disabled ? 0.35 : 1,
            transition: dragging ? 'none' : 'height 220ms cubic-bezier(0.3,0,0.2,1)',
          }} />
        </div>
      )}
    </div>
  );
}
