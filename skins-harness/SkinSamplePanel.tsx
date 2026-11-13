import type { CSSProperties } from 'react';
import { PanelCatalogCell } from '../src/panel/dnd/PanelDragCells';
import { lookupApp } from '../src/panel/widgets/registry';
import panelStyles from '../src/panel/PanelApp.module.scss';
import type { PanelSkinId, SkinFilterMode } from '../src/panel/skins/skins';
import { SCENES } from './scenes';
import { GaugeSampler } from './GaugeSampler';

const CELL = 90;
const GAP = 6;

export interface SkinSamplePanelProps {
  skin: PanelSkinId | null;
  theme: 'dark' | 'light';
  scene: string;
  overlay: boolean;
  filter: SkinFilterMode;
  zoom?: number;
}

// Same var set the add-widget catalog and the site phone mock derive: 90px
// cells, 6px gaps, panel-scale 1.
const VARS = {
  '--panel-columns': 4,
  '--panel-cell-size': `${CELL}px`,
  '--panel-row-size': `${CELL}px`,
  '--panel-content-scale': `${CELL}px`,
  '--panel-scale': 1,
  '--panel-gap': `${GAP}px`,
  '--panel-widget-padding': `${GAP}px`,
  '--panel-card-bg-opacity': '100%',
} as CSSProperties;

export function SkinSamplePanel({ skin, theme, scene, overlay, filter, zoom = 1 }: SkinSamplePanelProps) {
  const def = SCENES.find(s => s.id === scene) ?? SCENES[0];
  const side = 4 * CELL + 3 * GAP;
  return (
    <div
      className="panel-root"
      data-theme={theme}
      data-surface="phone"
      data-panel-skin={skin ?? undefined}
      data-skin-overlay={skin ? (overlay ? 'on' : 'off') : undefined}
      data-skin-filter={skin ? filter : undefined}
      style={{
        ...VARS,
        position: 'relative',
        width: side + 2 * GAP,
        padding: GAP,
        boxSizing: 'border-box',
        background: 'var(--skin-backdrop, var(--backdrop-base))',
        zoom,
      } as CSSProperties}
    >
      <div className={panelStyles.grid} style={def.gauges ? { height: side } : undefined}>
        {def.gauges && <GaugeSampler />}
        {def.widgets.map(wd => {
          const app = lookupApp(wd.type);
          if (!app) return null;
          return (
            <PanelCatalogCell key={wd.id} widget={wd} surface="phone" label={wd.type} showLabel={false} />
          );
        })}
      </div>
    </div>
  );
}
