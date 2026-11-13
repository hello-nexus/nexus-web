// Skin stylesheets load on demand: a panel without a skin never fetches any of
// this CSS, and a skin's @font-face rules (pixel, seven-segment) ride in that
// skin's own chunk, so its fonts download only when the skin is applied.
import type { PanelSkinId } from './skins';

const LOADERS: Record<PanelSkinId, () => Promise<unknown>> = {
  pixel: () => import('./pixel.scss'),
  lcd: () => import('./lcd.scss'),
  crt: () => import('./crt.scss'),
  vfd: () => import('./vfd.scss'),
  hud: () => import('./hud.scss'),
  neon: () => import('./neon.scss'),
  blueprint: () => import('./blueprint.scss'),
  eink: () => import('./eink.scss'),
};

const loaded = new Set<string>();

export async function loadSkinStyles(id: PanelSkinId): Promise<void> {
  if (!loaded.has('base')) {
    loaded.add('base');
    await import('./skinBase.scss');
  }
  if (loaded.has(id)) return;
  loaded.add(id);
  await LOADERS[id]();
}
