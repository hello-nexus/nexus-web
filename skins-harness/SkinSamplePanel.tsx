import { useEffect, type CSSProperties } from 'react';
import { PanelCatalogCell } from '../src/panel/dnd/PanelDragCells';
import { lookupApp } from '../src/panel/widgets/registry';
import panelStyles from '../src/panel/PanelApp.module.scss';
import { deriveAccentVars } from '../src/lib/settings';
import { loadSkinStyles } from '../src/panel/skins/skinLoader';
import { skinAccentVars, skinDef, skinFontVars, type PanelSkinId, type SkinFont } from '../src/panel/skins/skins';
import { SCENES } from './scenes';
import { GaugeSampler } from './GaugeSampler';

const CELL = 90;
const GAP = 6;

export interface SkinSamplePanelProps {
  skin: PanelSkinId | null;
  variant: string | null;
  mode: 'dark' | 'light';
  font: SkinFont | null;
  accent: string;
  scene: string;
  overlay: boolean;
  zoom?: number;
}

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

export function SkinSamplePanel({ skin, variant, mode, font, accent, scene, overlay, zoom = 1 }: SkinSamplePanelProps) {
  useEffect(() => { if (skin) void loadSkinStyles(skin); }, [skin]);
  const def = SCENES.find(s => s.id === scene) ?? SCENES[0];
  const side = 4 * CELL + 3 * GAP;
  const sk = skinDef(skin);
  // Stock panel: the user's accent through the existing derivation. A style
  // skin reads --skin-accent instead; a screen skin ignores the accent.
  const accentVars = !sk ? deriveAccentVars(accent, mode)
    : sk.accent ? skinAccentVars(sk.id, accent) : {};
  return (
    <div
      className="panel-root"
      data-theme={mode}
      data-surface="phone"
      data-panel-skin={skin ?? undefined}
      data-skin-variant={skin && variant ? variant : undefined}
      data-skin-overlay={skin ? (overlay ? 'on' : 'off') : undefined}
      style={{
        ...VARS,
        ...accentVars,
        ...skinFontVars(font),
        position: 'relative',
        width: side + 2 * GAP,
        padding: GAP,
        boxSizing: 'border-box',
        background: skin ? undefined : 'var(--backdrop-base)',
        zoom,
      } as CSSProperties}
    >
      <div className={panelStyles.grid} style={def.gauges ? { height: side } : undefined}>
        {def.gauges && <GaugeSampler />}
        {def.widgets.map(wd => {
          const app = lookupApp(wd.type);
          if (!app) return null;
          return <PanelCatalogCell key={wd.id} widget={wd} surface="phone" label={wd.type} showLabel={false} />;
        })}
      </div>
    </div>
  );
}
