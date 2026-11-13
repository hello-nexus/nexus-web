import { useEffect, type CSSProperties } from 'react';
import { PanelCatalogCell } from '../src/panel/dnd/PanelDragCells';
import { lookupApp } from '../src/panel/widgets/registry';
import panelStyles from '../src/panel/PanelApp.module.scss';
import { deriveAccentVars } from '../src/lib/settings';
import { loadSkinStyles } from '../src/panel/skins/skinLoader';
import { skinAccentVars, skinDef, skinFontVars, type PanelSkinId, type SkinFont } from '../src/panel/skins/skins';
import { SCENES } from './scenes';
import { GaugeSampler } from './GaugeSampler';
import { ChromeScene } from './ChromeScene';
import { PanelSkinScope } from '../src/components/common/ThemeScope/PanelSkinScope';

const CELL = 90;
const GAP = 6;

export interface SkinSamplePanelProps {
  skin: PanelSkinId | null;
  mode: 'dark' | 'light';
  font: SkinFont | null;
  accent: string;
  scene: string;
  overlay: boolean;
  zoom?: number;
  pad?: number;
  op?: number;
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

export function SkinSamplePanel({ skin, mode, font, accent, scene, overlay, zoom = 1, pad = 6, op = 100 }: SkinSamplePanelProps) {
  useEffect(() => { if (skin) void loadSkinStyles(skin); }, [skin]);
  const def = SCENES.find(s => s.id === scene) ?? SCENES[0];
  const side = 4 * CELL + 3 * pad;
  const sk = skinDef(skin);
  const open = new URLSearchParams(location.search).get('open') === '1';
  // Stock panel: the user's accent through the existing derivation. A style
  // skin reads --skin-accent instead; a screen skin ignores the accent.
  const accentVars = !sk ? deriveAccentVars(accent, mode)
    : sk.accent ? skinAccentVars(sk.id, accent) : {};
  const themeVars = {
    ...VARS,
    '--panel-gap': `${pad}px`,
    '--panel-widget-padding': `${pad}px`,
    '--panel-card-bg-opacity': `${op}%`,
    '--panel-card-bg-alpha': String(op / 100),
    ...accentVars,
    ...skinFontVars(font),
  } as CSSProperties;
  const skinAttrs: Record<string, string> = skin ? {
    'data-panel-skin': skin,
    'data-skin-overlay': overlay ? 'on' : 'off',
    ...(op < 50 ? { 'data-skin-card-faded': '' } : {}),
  } : {};
  const scope = skin ? { attrs: { ...skinAttrs, 'data-theme': mode, 'data-surface': 'phone' }, style: themeVars } : null;
  return (
    <PanelSkinScope scope={scope}>
      <div
        className="panel-root"
        data-theme={mode}
        data-surface="phone"
        data-widget-padding={pad === 0 ? 'none' : undefined}
        {...skinAttrs}
        data-skin-root={skin ? '' : undefined}
        style={{
          ...themeVars,
          position: 'relative',
          width: side + 2 * pad,
          padding: pad,
          boxSizing: 'border-box',
          background: skin ? undefined : 'var(--backdrop-base)',
          zoom,
          ...(def.chrome ? { height: side + 2 * pad, overflow: 'hidden' } : {}),
        } as CSSProperties}
      >
        {skin && <div data-skin-part="backdrop" aria-hidden="true" />}
        {def.chrome ? <ChromeScene open={open} themeMode={mode} themeVars={themeVars} /> : (
          <div className={panelStyles.grid} style={def.gauges ? { height: side } : undefined}>
            {def.gauges && <GaugeSampler />}
            {def.widgets.map(wd => {
              const app = lookupApp(wd.type);
              if (!app) return null;
              return <PanelCatalogCell key={wd.id} widget={wd} surface="phone" label={wd.type} showLabel={false} />;
            })}
          </div>
        )}
      </div>
    </PanelSkinScope>
  );
}
