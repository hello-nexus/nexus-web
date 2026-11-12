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
