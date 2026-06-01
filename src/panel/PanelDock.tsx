import { ErrorBoundary } from '../components/common/ErrorBoundary/ErrorBoundary';
import { useTranslation } from '../lib/i18n';
import { lookupApp } from './widgets/registry';
import { WidgetCellLabel } from './widgets/common/WidgetCellLabel';
import type { PanelSurface, PanelWidget } from './types';
import styles from './PanelDock.module.scss';

// iOS-springboard dock: up to 4 1x1 icons, persistent across pages, centered
// when fewer than 4. Sized from CSS vars (--panel-cell-size /
// --panel-row-size / --panel-gap) so each slot matches a 1x1 page widget.
export const MAX_DOCK_SLOTS = 4;

interface PanelDockProps {
  widgets: PanelWidget[];
  surface: PanelSurface;
  // 'portrait' anchors at the bottom (a single row), 'landscape' at the
  // right (a single column).
  orientation: 'portrait' | 'landscape';
}

export function PanelDock({ widgets, surface, orientation }: PanelDockProps) {
  const { t } = useTranslation();
  // Only 1x1 widgets, capped at 4; others filtered out silently (defensive,
  // store-level normalization also enforces this).
  const visible = widgets.filter(w => w.size === '1x1').slice(0, MAX_DOCK_SLOTS);

  return (
    <div
      className={styles.dock}
      data-orientation={orientation}
      data-surface={surface}
      role="toolbar"
      aria-label="Dock"
    >
      {visible.map(widget => {
        const def = lookupApp(widget.type);
        if (!def) return null;
        const Comp = def.Widget;
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
