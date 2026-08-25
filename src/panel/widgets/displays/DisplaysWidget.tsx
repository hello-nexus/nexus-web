import { useCallback, useEffect, useRef, useState } from 'react';
import { Sun, Monitor } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { fetchDisplays, fetchDisplayBrightness, setDisplayBrightness, type Display } from '../../../api/displays';
import { EmptyState } from '../../../components/common/EmptyState/EmptyState';
import { HoverTooltip } from '../../../components/common/HoverTooltip/HoverTooltip';
import { PanelMixerSlider } from '../common/PanelMixerSlider';
import { useFaderPager } from '../common/useFaderPager';
import { PanelArrowButton } from '../../chrome/PanelArrowButton';
import type { WidgetProps } from '../types';
import { usePanelPreview } from '../common/PanelPreviewContext';
import { DISPLAYS_PREVIEW } from './displaysPreviewData';
import styles from './DisplaysWidget.module.scss';

const REFRESH_MS = 5000;
const OPTIMISTIC_SETTLE_MS = 1500;
// Per page, not a cap: what fits across the tile at a usable slider width.
// Anything past this pages behind the arrows rather than vanishing.
const COMPACT_DISPLAYS_PER_PAGE = 2;
const FULL_DISPLAYS_PER_PAGE = 4;

export function DisplaysWidget({ widget }: WidgetProps) {
  const { t } = useTranslation();
  const preview = usePanelPreview();
  const [displays, setDisplays] = useState<Display[]>(preview ? DISPLAYS_PREVIEW.displays : []);
  const [hint, setHint] = useState<string>('');
  const [values, setValues] = useState<Record<string, number>>(preview ? DISPLAYS_PREVIEW.values : {});
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
  const savedOrder = (widget.config?.displayOrder as string[] | undefined) ?? [];

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
    if (preview) return;
    hydrate();
    const timer = window.setInterval(hydrate, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [preview, hydrate]);

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

  const orderedDisplays = applyDisplayOrder(displays, savedOrder);
  const perPage = compact ? COMPACT_DISPLAYS_PER_PAGE : FULL_DISPLAYS_PER_PAGE;
  // Above the early return: a hook cannot sit behind a conditional.
  const pager = useFaderPager(orderedDisplays, perPage);

  if (displays.length === 0) {
    return (
      <EmptyState
        compact
        icon={<Monitor strokeWidth={1.4} />}
        title={t('displays.empty')}
        hint={hint || undefined}
      />
    );
  }

  return (
    <div className={styles.displays} data-size={widget.size}>
      <div className={styles.sliderStage} data-paged={pager.paged ? 'true' : 'false'}>
        {pager.paged && (
          <PanelArrowButton
            side="prev"
            className={styles.sliderArrow}
            disabled={pager.page === 0}
            onClick={pager.prev}
            ariaLabel={t('displays.panel.prev')}
          />
        )}
      <div className={styles.sliderGrid}>
        {pager.visible.map((d, i) => {
          const brightness = values[d.id] ?? d.brightnessControl?.current ?? 0;
          return (
            <DisplayBrightnessSlider
              key={d.id}
              display={d}
              brightness={brightness}
              error={errors[d.id] || ''}
              indexBadge={orderedDisplays.length > 1 ? `#${pager.page * perPage + i + 1}` : undefined}
              onPointerDown={() => startDrag(d.id)}
              onChange={v => pushBrightness(d.id, v)}
              onCommit={v => endDrag(d.id, v)}
              onToggle={() => toggleBrightness(d.id, brightness)}
            />
          );
        })}
      </div>
        {pager.paged && (
          <PanelArrowButton
            side="next"
            className={styles.sliderArrow}
            disabled={pager.page >= pager.pages - 1}
            onClick={pager.next}
            ariaLabel={t('displays.panel.next')}
          />
        )}
      </div>
      {hint && <div className={styles.hint}>{hint}</div>}
    </div>
  );
}

function DisplayBrightnessSlider({
  display,
  brightness,
  error,
  indexBadge,
  onPointerDown,
  onChange,
  onCommit,
  onToggle,
}: {
  display: Display;
  brightness: number;
  error: string;
  indexBadge?: string;
  onPointerDown: () => void;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const supports = supportsBrightness(display);
  const off = brightness <= 0;
  const tooltipBody = error || display.brightnessControl?.unsupportedReason || display.name;
  // The badge joins the accessible name so duplicate monitor models stay
  // distinguishable to screen readers.
  const accessibleName = indexBadge ? `${display.name} ${indexBadge}` : display.name;
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
        topLabel={display.name}
        indexBadge={indexBadge}
        valueLabel={supports ? `${Math.round(brightness)}` : '--'}
        icon={<Sun strokeWidth={1.7} />}
        iconButton={{
          ariaLabel: off
            ? t('displays.aria.restore', { name: accessibleName })
            : t('displays.aria.turnOff', { name: accessibleName }),
          ariaPressed: off,
          active: off,
          onClick: onToggle,
        }}
        onInteractionStart={onPointerDown}
        onChange={onChange}
        onCommit={onCommit}
        ariaLabel={t('displays.aria.brightness', { name: accessibleName })}
        className={styles.displaySlider}
      />
    </div>
    </HoverTooltip>
  );
}

function applyDisplayOrder(displays: Display[], order: string[]): Display[] {
  if (order.length === 0) return displays;
  const byId = new Map(displays.map(d => [d.id, d]));
  const result: Display[] = [];
  for (const id of order) {
    const d = byId.get(id);
    if (d) result.push(d);
  }
  for (const d of displays) {
    if (!result.includes(d)) result.push(d);
  }
  return result;
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
