import { type CSSProperties } from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useTranslation } from '../lib/i18n';
import { lookupWidget } from './widgets/registry';
import { WidgetCellLabel } from './widgets/common/WidgetCellLabel';
import type { PanelSurface, PanelWidget } from './types';
import styles from './PanelDock.module.scss';

interface PanelDockProps {
  widgets: PanelWidget[];
  // Capacity = shortest grid axis. Always 1x1 cells, count == short side.
  slotCount: number;
  surface: PanelSurface;
  // 'portrait' anchors at the bottom (rows of 1x1 along the short axis).
  // 'landscape' anchors at the right (column of 1x1 along the short axis).
  orientation: 'portrait' | 'landscape';
  // Cell size in CSS px so the dock matches the grid cells exactly.
  cellSize: number;
  gap: number;
}

export function PanelDock({ widgets, slotCount, surface, orientation, cellSize, gap }: PanelDockProps) {
  const { t } = useTranslation();
  const slots = Array.from({ length: Math.max(1, slotCount) });
  const visible = widgets.slice(0, slotCount);

  // Dock slot is `cellSize` square (matches the paged grid's 1x1 cells).
  // Inside, the slot card + label stack uses the same `--panel-widget-card-margin-x`
  // / `--panel-widget-card-bottom-gap` / `--panel-widget-label-strip` rules
  // as the grid, so a 1x1 widget on the grid lines up exactly with a dock
  // icon directly above/below it.
  const dockStyle: CSSProperties = orientation === 'portrait'
    ? {
        display: 'grid',
        gridTemplateColumns: `repeat(${slots.length}, ${cellSize}px)`,
        gridTemplateRows: `${cellSize}px`,
        gap: `${gap}px`,
      }
    : {
        display: 'grid',
        gridTemplateColumns: `${cellSize}px`,
        gridTemplateRows: `repeat(${slots.length}, ${cellSize}px)`,
        gap: `${gap}px`,
      };

  return (
    <div
      className={styles.dock}
      style={dockStyle}
      data-orientation={orientation}
      data-surface={surface}
      role="toolbar"
      aria-label="Dock"
    >
      {slots.map((_, idx) => {
        const widget = visible[idx];
        if (!widget) {
          return (
            <div key={`slot-${idx}`} className={styles.dockSlotWrap} aria-hidden="true">
              <div className={`${styles.dockSlot} ${styles.placeholderSlot}`} />
            </div>
          );
        }
        const def = lookupWidget(widget.type);
        if (!def) {
          return (
            <div key={widget.id} className={styles.dockSlotWrap}>
              <div className={styles.dockSlot} />
            </div>
          );
        }
        const Comp = def.Component;
        const label = t(def.meta.i18nKey) || widget.type;
        return (
          <ErrorBoundary key={widget.id} label={`dock:${widget.type}`}>
            <div className={styles.dockSlotWrap} data-panel-widget-id={widget.id}>
              <div className={`panel-card ${styles.dockSlot}`}>
                <Comp widget={widget} surface={surface} />
              </div>
              <div className={styles.dockSlotLabelStrip}>
                <WidgetCellLabel label={label} />
              </div>
            </div>
          </ErrorBoundary>
        );
      })}
    </div>
  );
}
