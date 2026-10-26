import type { TopologyDisplay } from '../../api/displays';

export interface WindowRect {
  screenX: number;
  screenY: number;
  outerWidth: number;
  outerHeight: number;
  devicePixelRatio: number;
}

type MapDisplay = Pick<TopologyDisplay, 'id' | 'bounds' | 'resolution' | 'isPrimary'>;

const contains = (d: MapDisplay, x: number, y: number) =>
  d.bounds !== null && x >= d.bounds.x && x < d.bounds.x + d.bounds.width && y >= d.bounds.y && y < d.bounds.y + d.bounds.height;

/**
 * The display the app window's center sits on. Windows reports bounds in physical pixels while the
 * browser reports CSS pixels, so the center is tried scaled by the pixel ratio first when the bounds
 * are physical; macOS bounds are points and match the browser as is. Falls back to the primary display.
 */
export function displayIdForWindow(displays: readonly MapDisplay[], win: WindowRect): string | null {
  if (displays.length === 0) return null;
  const cx = win.screenX + win.outerWidth / 2;
  const cy = win.screenY + win.outerHeight / 2;
  const physical = displays.every(d => d.bounds !== null && d.bounds.width === d.resolution.width);
  const ratio = physical && win.devicePixelRatio > 0 ? win.devicePixelRatio : 1;
  const candidates = ratio === 1 ? [[cx, cy]] : [[cx * ratio, cy * ratio], [cx, cy]];
  for (const [x, y] of candidates) {
    const hit = displays.find(d => contains(d, x, y));
    if (hit) return hit.id;
  }
  return (displays.find(d => d.isPrimary) ?? displays[0]).id;
}
