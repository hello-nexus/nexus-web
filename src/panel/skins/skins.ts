// Panel skin registry (prototype). A skin is one attribute on the panel root,
// data-panel-skin="<id>", styled by src/panel/skins/<id>.scss. Post-process
// layers hang off two more attributes: data-skin-overlay (a pseudo-element
// grid or scanline layer) and data-skin-filter (an SVG filter on the root).

export const PANEL_SKINS = [
  { id: 'pixel', label: 'Pixel', themes: 'both', filter: 'pixelate' },
  { id: 'lcd', label: 'LCD', themes: 'dark-only', filter: 'lcd' },
  { id: 'crt', label: 'CRT green', themes: 'dark-only', filter: 'crt' },
  { id: 'crt-amber', label: 'CRT amber', themes: 'dark-only', filter: 'crt-amber' },
  { id: 'vfd', label: 'VFD', themes: 'dark-only', filter: 'vfd' },
  { id: 'hud', label: 'HUD', themes: 'both', filter: null },
  { id: 'blueprint', label: 'Blueprint', themes: 'dark-only', filter: null },
  { id: 'eink', label: 'E-ink', themes: 'light-only', filter: 'eink' },
  { id: 'neon', label: 'Neon', themes: 'dark-only', filter: null },
] as const;

export type PanelSkinId = (typeof PANEL_SKINS)[number]['id'];

// Null is the stock look; an unknown id reads as null (same rule as panelFont).
export function normalizePanelSkin(value?: string | null): PanelSkinId | null {
  return PANEL_SKINS.find(s => s.id === value)?.id ?? null;
}

export type SkinFilterMode = 'off' | 'on' | 'bloom';
