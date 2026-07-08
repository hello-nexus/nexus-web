import type { CSSProperties } from 'react';
import { useTranslation } from '../../lib/i18n';
import { PanelCatalogCell } from '../../panel/dnd/PanelDragCells';
import { lookupApp } from '../../panel/widgets/registry';
import { PHONE_WIDGET_REFERENCE_CELL } from '../../panel/engine/panelGrid';
import type { PanelWidget } from '../../panel/types';
import panelStyles from '../../panel/PanelApp.module.scss';
import styles from '../site.module.scss';

// The phone mock renders the app's REAL panel widgets through the same
// catalog cell the add-widget picker uses (preview mode, fixture data, zero
// I/O), so the mock tracks the product's widgets as they evolve. Loaded
// lazily: the widget registry is far too heavy for the landing page's
// critical path.
const PHONE_CELL_PX = 70;
const PHONE_WIDGETS: PanelWidget[] = [
  { id: 'site-displays', type: 'displays', size: '2x2', col: 0, row: 0 },
  { id: 'site-monitoring', type: 'monitoring', size: '2x2', col: 0, row: 2 },
  { id: 'site-deck', type: 'deck', size: '2x2', col: 0, row: 4 },
];

// Same var set PanelWidgetCatalog derives for its grid.
const PHONE_PANEL_VARS = {
  '--panel-columns': 2,
  '--panel-cell-size': `${PHONE_CELL_PX}px`,
  '--panel-row-size': `${PHONE_CELL_PX}px`,
  '--panel-content-scale': `${PHONE_CELL_PX}px`,
  '--panel-scale': PHONE_CELL_PX / PHONE_WIDGET_REFERENCE_CELL,
  '--panel-gap': '8px',
  '--panel-card-bg-opacity': '100%',
} as CSSProperties;

export function PhonePanelPreview() {
  const { t } = useTranslation();
  return (
    <div
      className={`panel-root ${styles.phonePanel}`}
      data-theme="dark"
      data-surface="phone"
      style={PHONE_PANEL_VARS}
    >
      <div className={panelStyles.grid}>
        {PHONE_WIDGETS.map(w => {
          const def = lookupApp(w.type);
          if (!def) return null;
          return (
            <PanelCatalogCell
              key={w.id}
              widget={w}
              surface="phone"
              label={t(def.meta.i18nKey)}
            />
          );
        })}
      </div>
    </div>
  );
}
