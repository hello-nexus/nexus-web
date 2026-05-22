import { useCallback, useEffect, useRef, useState } from 'react';
import { Sun, Monitor } from 'lucide-react';
import { fetchDisplays, fetchDisplayBrightness, setDisplayBrightness, type Display } from '../../../api/displays';
import { EmptyState } from '../../../components/common/EmptyState/EmptyState';
import { HoverTooltip } from '../../../components/common/HoverTooltip/HoverTooltip';
import { PanelMixerSlider } from '../common/PanelMixerSlider';
import type { WidgetProps } from '../types';
import styles from './DisplaysWidget.module.scss';

const REFRESH_MS = 5000;
const OPTIMISTIC_SETTLE_MS = 1500;
const COMPACT_DISPLAY_LIMIT = 2;
const FULL_DISPLAY_LIMIT = 4;

export function DisplaysWidget({ widget }: WidgetProps) {
  const [displays, setDisplays] = useState<Display[]>([]);
  const [hint, setHint] = useState<string>('');
  const [values, setValues] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Per-display "always-send-latest" write loop. `pending` holds the most
  // recent finger position waiting to be POSTed; `inflight` is true while a
  // POST is on the wire. Hardware pacing is handled by the service; the panel
  // only coalesces network intent and always sends the latest target.
  const pendingRef = useRef<Record<string, number>>({});
  const inflightRef = useRef<Set<string>>(new Set());
  const draggingRef = useRef<Set<string>>(new Set());
  const lastSentValueRef = useRef<Record<string, number>>({});
  const optimisticUntilRef = useRef<Record<string, number>>({});
  // Remembers the brightness to restore when toggling back on via the icon.
  // Updated whenever the user lands on a non-zero value.
  const lastNonZeroRef = useRef<Record<string, number>>({});
  const compact = widget.size === '2x2';

  const hydrate = useCallback(async () => {
    const list = await fetchDisplays();
    if (!list) return;
    setDisplays(prev => sameDisplays(prev, list.displays) ? prev : list.displays);
    setHint(list.hint || '');
    const next: Record<string, number> = {};
    await Promise.all(list.displays.map(async d => {
      if (!supportsBrightness(d)) return;
      // Skip refresh for any display the user is actively dragging or whose
      // POST is currently on the wire - the optimistic value in state is the
      // truth until the loop drains.
      if (draggingRef.current.has(d.id) ||
          inflightRef.current.has(d.id) ||
          pendingRef.current[d.id] !== undefined ||
          Date.now() < (optimisticUntilRef.current[d.id] ?? 0)) return;
      if (typeof d.brightnessControl?.current === 'number') {
        next[d.id] = d.brightnessControl.current;
        return;
      }
      const b = await fetchDisplayBrightness(d.id);
      if (b) next[d.id] = b.brightness;
    }));
    if (Object.keys(next).length > 0) {
      setValues(prev => {
        const merged = { ...prev };
        for (const [id, v] of Object.entries(next)) {
          if (draggingRef.current.has(id) ||
              inflightRef.current.has(id) ||
              pendingRef.current[id] !== undefined ||
              Date.now() < (optimisticUntilRef.current[id] ?? 0)) continue;
          merged[id] = v;
        }
        return merged;
      });
    }
  }, []);

  useEffect(() => {
    hydrate();
    const timer = window.setInterval(hydrate, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [hydrate]);

  const drainPending = useCallback(async (id: string) => {
    if (inflightRef.current.has(id)) return;
    while (pendingRef.current[id] !== undefined) {
      const value = pendingRef.current[id];

      // Skip no-op writes; failed writes clear this marker so the same value
      // can be retried.
      if (lastSentValueRef.current[id] === value) {
        delete pendingRef.current[id];
        continue;
      }

      delete pendingRef.current[id];
      inflightRef.current.add(id);
      try {
        const result = await setDisplayBrightness(id, value);
        if (result?.status === 'applied') {
          lastSentValueRef.current[id] = value;
          optimisticUntilRef.current[id] = Date.now() + OPTIMISTIC_SETTLE_MS;
          setErrors(prev => {
            if (!prev[id]) return prev;
            const next = { ...prev };
            delete next[id];
            return next;
          });
        } else {
          delete lastSentValueRef.current[id];
          const message = result?.error || 'Brightness update failed';
          setErrors(prev => ({ ...prev, [id]: message }));
        }
      } catch {
        delete lastSentValueRef.current[id];
        setErrors(prev => ({ ...prev, [id]: 'Brightness update failed' }));
      }
      finally {
        inflightRef.current.delete(id);
      }
    }
  }, []);

  const pushBrightness = useCallback((id: string, value: number) => {
    setValues(prev => ({ ...prev, [id]: value }));
    optimisticUntilRef.current[id] = Date.now() + OPTIMISTIC_SETTLE_MS;
    if (value > 0) lastNonZeroRef.current[id] = value;
    setErrors(prev => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    pendingRef.current[id] = value;
    void drainPending(id);
  }, [drainPending]);

  const toggleBrightness = useCallback((id: string, current: number) => {
    const restore = lastNonZeroRef.current[id] ?? 100;
    const target = current > 0 ? 0 : restore;
    if (current > 0) lastNonZeroRef.current[id] = current;
    pushBrightness(id, target);
  }, [pushBrightness]);

  const startDrag = useCallback((id: string) => {
    draggingRef.current.add(id);
  }, []);

  const endDrag = useCallback((id: string, value: number) => {
    draggingRef.current.delete(id);
    setValues(prev => ({ ...prev, [id]: value }));
    optimisticUntilRef.current[id] = Date.now() + OPTIMISTIC_SETTLE_MS;
    pendingRef.current[id] = value;
    void drainPending(id);
  }, [drainPending]);

  if (displays.length === 0) {
    return (
      <EmptyState
        compact
        icon={<Monitor strokeWidth={1.4} />}
        title="No displays detected"
        hint={hint || undefined}
      />
    );
  }

  const visibleDisplays = displays.slice(0, compact ? COMPACT_DISPLAY_LIMIT : FULL_DISPLAY_LIMIT);

  return (
    <div className={styles.displays} data-size={widget.size}>
      <div className={styles.sliderGrid} data-count={visibleDisplays.length}>
        {visibleDisplays.map((d, i) => {
          const brightness = values[d.id] ?? d.brightnessControl?.current ?? 0;
          return (
            <DisplayBrightnessSlider
              key={d.id}
              display={d}
              brightness={brightness}
              error={errors[d.id] || ''}
              index={i}
              onPointerDown={() => startDrag(d.id)}
              onChange={v => pushBrightness(d.id, v)}
              onCommit={v => endDrag(d.id, v)}
              onToggle={() => toggleBrightness(d.id, brightness)}
            />
          );
        })}
      </div>
      {hint && <div className={styles.hint}>{hint}</div>}
    </div>
  );
}

function DisplayBrightnessSlider({
  display,
  brightness,
  error,
  index,
  onPointerDown,
  onChange,
  onCommit,
  onToggle,
}: {
  display: Display;
  brightness: number;
  error: string;
  index: number;
  onPointerDown: () => void;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
  onToggle: () => void;
}) {
  const supports = supportsBrightness(display);
  const off = brightness <= 0;
  const tooltipBody = error || display.brightnessControl?.unsupportedReason || display.name;
  return (
    <HoverTooltip body={tooltipBody} side="top">
    <div
      className={styles.sliderCell}
      data-supports={supports ? 'true' : 'false'}
    >
      <PanelMixerSlider
        min={0}
        max={100}
        value={brightness}
        disabled={!supports}
        topLabel={`DISPLAY ${index + 1}`}
        valueLabel={supports ? `${Math.round(brightness)}` : '--'}
        icon={<Sun strokeWidth={1.7} />}
        iconButton={{
          ariaLabel: off ? `Restore brightness ${display.name}` : `Turn off ${display.name}`,
          ariaPressed: off,
          active: off,
          onClick: onToggle,
        }}
        onInteractionStart={onPointerDown}
        onChange={onChange}
        onCommit={onCommit}
        ariaLabel={`Brightness ${display.name}`}
        className={styles.displaySlider}
      />
    </div>
    </HoverTooltip>
  );
}

function sameDisplays(a: Display[], b: Display[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false;
    if (a[i].name !== b[i].name) return false;
    if (supportsBrightness(a[i]) !== supportsBrightness(b[i])) return false;
    if (a[i].brightnessControl?.controlPath !== b[i].brightnessControl?.controlPath) return false;
    if (a[i].brightnessControl?.writeMode !== b[i].brightnessControl?.writeMode) return false;
  }
  return true;
}

function supportsBrightness(display: Display): boolean {
  return display.brightnessControl?.supported ?? display.capabilities.brightness;
}

export default DisplaysWidget;
