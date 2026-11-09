import type { CaseFanSlot } from './caseLayout';
import { AIO_FAN_PREFIX } from './slotFlow';

/** The product Build placed in a fan slot, with the ratings its catalog entry states; an unstated rating stays undefined. */
export interface SlotProduct {
  title: string;
  rpmMax?: number;
  airflowCfm?: number;
  staticMmH2O?: number;
}

/**
 * The product a slot carries itself, or null. Only the slot's own record counts: a same-size owned fan elsewhere in the setup that the airflow model borrows numbers from is not this slot's product.
 * An AIO radiator fan takes its product from the radiator spec Build keeps on the case slots the radiator covers.
 */
export function slotProduct(slot: CaseFanSlot, slots: readonly CaseFanSlot[]): SlotProduct | null {
  if (slot.taken !== 'fan') return null;
  if (slot.key.startsWith(AIO_FAN_PREFIX)) {
    const r = slots.find(s => s.radiator?.title)?.radiator;
    return r?.title ? { title: r.title, rpmMax: r.fanRpmMax, airflowCfm: r.fanAirflowCfm, staticMmH2O: r.fanStaticPressureMmH2O } : null;
  }
  const f = slot.fan;
  return f?.title ? { title: f.title, rpmMax: f.rpmMax, airflowCfm: f.airflowCfm, staticMmH2O: f.staticPressureMmH2O } : null;
}

export interface PillPoint {
  key: string;
  x: number;
  y: number;
}

/** Moves pills that would overlap on screen apart vertically, in a stable order, so a cluster of fans stays legible. Returns each key's offset from its projected y. */
export function declutterPills(points: readonly PillPoint[], width: number, height: number): Record<string, number> {
  const placed: { x: number; y: number }[] = [];
  const out: Record<string, number> = {};
  for (const p of [...points].sort((a, b) => a.y - b.y || a.x - b.x || a.key.localeCompare(b.key))) {
    let y = p.y;
    for (let guard = 0; guard < points.length; guard++) {
      const hit = placed.find(q => Math.abs(q.x - p.x) < width && Math.abs(q.y - y) < height);
      if (!hit) break;
      y = hit.y + height;
    }
    placed.push({ x: p.x, y });
    out[p.key] = y - p.y;
  }
  return out;
}
