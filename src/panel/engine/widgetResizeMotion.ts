export interface WidgetResizeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function buildWidgetResizeMotionStyle(
  sourceRect: WidgetResizeRect,
  targetRect: WidgetResizeRect,
): Record<string, string> {
  const width = Math.max(1, targetRect.width);
  const height = Math.max(1, targetRect.height);

  return {
    '--panel-resize-motion-start-x': `${Math.round(sourceRect.left - targetRect.left)}px`,
    '--panel-resize-motion-start-y': `${Math.round(sourceRect.top - targetRect.top)}px`,
    '--panel-resize-motion-start-scale-x': (sourceRect.width / width).toFixed(4),
    '--panel-resize-motion-start-scale-y': (sourceRect.height / height).toFixed(4),
  };
}
