// Skin stylesheets load on demand: a panel without a skin never fetches any of
// this CSS, and a skin's @font-face rules (pixel, seven-segment) ride in that
// skin's own chunk, so its fonts download only when the skin is applied.
import { useEffect, useState } from 'react';
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
  bevel: () => import('./bevel.scss'),
  hifi: () => import('./hifi.scss'),
  cockpit: () => import('./cockpit.scss'),
  arcade: () => import('./arcade.scss'),
  glass: () => import('./glass.scss'),
  mecha: () => import('./mecha.scss'),
  steampunk: () => import('./steampunk.scss'),
  nixie: () => import('./nixie.scss'),
  deco: () => import('./deco.scss'),
  swiss: () => import('./swiss.scss'),
  clay: () => import('./clay.scss'),
  sketch: () => import('./sketch.scss'),
  bubblegum: () => import('./bubblegum.scss'),
  sakura: () => import('./sakura.scss'),
  track: () => import('./track.scss'),
};

// One in-flight or settled load per key. A failed load leaves the cache, so the next call retries it.
const loads = new Map<string, Promise<void>>();

function once(key: string, load: () => Promise<unknown>): Promise<void> {
  let p = loads.get(key);
  if (!p) {
    p = load().then(() => undefined, (err: unknown) => {
      loads.delete(key);
      throw err;
    });
    loads.set(key, p);
  }
  return p;
}

// Base, then tint, then the skin: each sheet lands in that order.
export async function loadSkinStyles(id: PanelSkinId): Promise<void> {
  await once('base', () => import('./skinBase.scss'));
  await once('tint', () => import('./skinTint.scss'));
  await once(id, LOADERS[id]);
}

// True once the skin's CSS is in the page (always true without a skin). The panel keeps the stock look
// until then, and a failed load stays stock and is retried the next time the skin is applied.
export function useSkinStyles(id: PanelSkinId | null): boolean {
  const [ready, setReady] = useState<PanelSkinId | null>(null);
  useEffect(() => {
    if (!id) return undefined;
    let live = true;
    loadSkinStyles(id).then(() => { if (live) setReady(id); }, () => {});
    return () => { live = false; };
  }, [id]);
  return !id || ready === id;
}
