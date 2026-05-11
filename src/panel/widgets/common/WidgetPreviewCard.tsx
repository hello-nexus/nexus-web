import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ErrorBoundary } from '../../../components/ErrorBoundary';
import { lookupWidget } from '../registry';
import { sizeToSpan } from '../../engine/grid';
import type { PanelWidget, PanelWidgetSize } from '../../types';
import { WidgetCellLabel } from './WidgetCellLabel';
import styles from './WidgetPreviewCard.module.scss';

// Native render size of the inner widget. The actual visible tile width is
// measured at runtime and the inner is uniformly scaled to match. Using 90px
// per grid unit matches the .cellScaler reference inside the panel grid so
// the preview reads as the real widget at the same scale.
const CELL = 90;
const GAP = 6;

interface WidgetPreviewCardProps {
  widgetType: string;
  size: PanelWidgetSize;
  label: string;
  // 'natural' uses the widget size's own aspect ratio (4x2 -> 2:1 wide,
  // 2x2 / 4x4 -> square). 'square' forces 1:1 for grid-of-tiles layouts
  // (used by the desktop Y70 simulator catalog).
  aspect?: 'natural' | 'square';
  // Force a specific theme for the inner preview. When undefined, the inner
  // panel-root inherits the document-level theme (light/dark) via the panel
  // token mappings to `--text` etc. Pass 'dark' explicitly when the surrounding
  // shell is not panel-themed (e.g. Y70Popup catalog inside the desktop app).
  themeMode?: 'dark' | 'light';
  // Optional drag handlers from dnd-kit. Typed as unknown because dnd-kit's
  // listener-map shape is library-internal; we just spread them onto the
  // root element.
  dragRef?: (node: HTMLElement | null) => void;
  dragHandle?: ReactNode;
  dragListeners?: unknown;
  dragAttributes?: unknown;
  isDragging?: boolean;
  onClick?: () => void;
}

export function WidgetPreviewCard({
  widgetType,
  size,
  label,
  aspect = 'natural',
  themeMode,
  dragRef,
  dragListeners,
  dragAttributes,
  isDragging,
  onClick,
}: WidgetPreviewCardProps) {
  const def = lookupWidget(widgetType);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  const span = def ? sizeToSpan(size) : { cols: 1, rows: 1 };
  const innerW = span.cols * CELL + Math.max(0, span.cols - 1) * GAP;
  const innerH = span.rows * CELL + Math.max(0, span.rows - 1) * GAP;

  useEffect(() => {
    const el = previewRef.current;
    if (!el || innerW <= 0 || innerH <= 0) return;
    const update = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w <= 0 || h <= 0) return;
      // Fit by the tighter dimension. With aspect-ratio matching the inner
      // ratio, both match - this also handles the brief moment after layout
      // when only one dimension is final.
      const next = Math.min(w / innerW, h / innerH);
      if (next > 0 && Number.isFinite(next)) setScale(next);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [innerW, innerH]);

  if (!def) return null;
  const Comp = def.Component;

  const fakeWidget: PanelWidget = {
    id: 'preview',
    type: widgetType,
    size,
    col: 0,
    row: 0,
  };

  const previewAspect = aspect === 'square'
    ? '1 / 1'
    : `${span.cols} / ${span.rows}`;

  const innerStyle: CSSProperties = {
    width: innerW,
    height: innerH,
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
    pointerEvents: 'none',
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!onClick) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  // Hint to grid layouts that a wide tile (cols > rows, e.g. 4x2) should
  // span the full row in 2-column grids. Consumed by the panel sheet's grid;
  // omitted for normal tiles to keep the DOM clean.
  const isWide = aspect === 'natural' && span.cols > span.rows;

  return (
    <div
      ref={dragRef}
      className={`${styles.card} ${isDragging ? styles.cardDragging : ''}`}
      // Spread drag attributes/listeners FIRST so our explicit role / tabIndex
      // / onClick / onKeyDown / aria-label win on conflict. Today only the
      // pointer sensor is wired up in the catalog, but a future keyboard
      // sensor would otherwise stomp onKeyDown.
      {...((dragAttributes ?? {}) as Record<string, unknown>)}
      {...((dragListeners ?? {}) as Record<string, unknown>)}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      aria-label={label}
      data-tile-span={isWide ? 'wide' : undefined}
    >
      <div
        ref={previewRef}
        className={styles.preview}
        style={{ aspectRatio: previewAspect }}
      >
        <div
          className="panel-root"
          data-theme={themeMode}
          style={innerStyle}
        >
          <div className={`panel-card ${styles.thumbInner}`}>
            <ErrorBoundary label={widgetType}>
              <Comp widget={fakeWidget} />
            </ErrorBoundary>
          </div>
        </div>
      </div>
      <WidgetCellLabel label={label} />
    </div>
  );
}

export default WidgetPreviewCard;
