import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { buildWidgetResizeMotionStyle, type WidgetResizeRect } from './widgetResizeMotion';

interface PendingResizeMotion {
  widgetId: string;
  sourceRect: WidgetResizeRect;
}

export function useWidgetResizeMotion(
  rootRef: RefObject<HTMLElement | null>,
  resizeMotionClassName: string,
  durationMs: number,
  coordinateScale = 1,
) {
  const timerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const pendingRef = useRef<PendingResizeMotion | null>(null);
  const [resizeMotionWidgetId, setResizeMotionWidgetId] = useState<string | null>(null);

  const clearResizeMotion = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    cleanupRef.current?.();
    cleanupRef.current = null;
  }, []);

  const beginResizeMotion = useCallback((widgetId: string) => {
    const source = readWidgetElement(rootRef.current, widgetId);
    const sourceRect = toWidgetResizeRect(source?.getBoundingClientRect(), coordinateScale);
    if (!sourceRect) return false;

    clearResizeMotion();
    pendingRef.current = { widgetId, sourceRect };
    setResizeMotionWidgetId(widgetId);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      cleanupRef.current?.();
      cleanupRef.current = null;
      setResizeMotionWidgetId(prev => prev === widgetId ? null : prev);
    }, durationMs);
    return true;
  }, [clearResizeMotion, coordinateScale, durationMs, rootRef]);

  useLayoutEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;

    const target = readWidgetElement(rootRef.current, pending.widgetId);
    const targetRect = toWidgetResizeRect(target?.getBoundingClientRect(), coordinateScale);
    if (!target || !targetRect) return;

    const motionStyle = buildWidgetResizeMotionStyle(pending.sourceRect, targetRect);
    for (const [property, value] of Object.entries(motionStyle)) {
      target.style.setProperty(property, value);
    }
    target.classList.remove(resizeMotionClassName);
    void target.offsetWidth;
    target.classList.add(resizeMotionClassName);

    cleanupRef.current = () => {
      target.classList.remove(resizeMotionClassName);
      for (const property of Object.keys(motionStyle)) {
        target.style.removeProperty(property);
      }
    };
  });

  useEffect(() => () => clearResizeMotion(), [clearResizeMotion]);

  return {
    resizeMotionWidgetId,
    beginResizeMotion,
    clearResizeMotion,
  };
}

function readWidgetElement(root: HTMLElement | null, widgetId: string): HTMLElement | null {
  return root?.querySelector<HTMLElement>(`[data-panel-widget-id="${widgetId}"]`) ?? null;
}

function toWidgetResizeRect(rect: DOMRect | undefined, coordinateScale: number): WidgetResizeRect | undefined {
  const scale = Number.isFinite(coordinateScale) && coordinateScale > 0 ? coordinateScale : 1;
  return rect
    ? { left: rect.left / scale, top: rect.top / scale, width: rect.width / scale, height: rect.height / scale }
    : undefined;
}
