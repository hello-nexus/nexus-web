import type { FanChannel } from '../../api/cooling';
import { defaultDirection, type CaseFanSlot, type FanBinding } from './caseLayout';
import { scaledSpec, simRpm, speedFraction, type SlotSpeed } from './fanSpeed';
import { inferRadiatorFans, slotModelFans, type CatalogFanSpec } from './fanSpecs';
import { radiatorFanKey } from './radiatorFans';
import { solveCasePressure, type FanDirection, type PressureFan } from './pressureModel';

export const GPU_FAN_PREFIX = 'gpu:fan:';
export const AIO_FAN_PREFIX = 'rad:';
/** A binding to this id says the user unlinked the fan, so no default applies to its slots. */
export const NO_FAN_CHANNEL = 'none';

export const isGpuSlotKey = (key: string): boolean => key.startsWith(GPU_FAN_PREFIX);

const gpuIndex = (key: string): number => Number.parseInt(key.slice(GPU_FAN_PREFIX.length), 10) || 0;

const isAioSlot = (slot: Pick<CaseFanSlot, 'key' | 'taken'>): boolean => slot.key.startsWith(AIO_FAN_PREFIX) || slot.taken === 'radiator';

/** The keys of the fans a slot stands for: a mounted radiator's fans are the slot's key, then `key#1`, `key#2`; any other slot is one fan. */
export function slotFanKeys(slot: Pick<CaseFanSlot, 'key' | 'taken' | 'size' | 'radiator'>): string[] {
  if (slot.taken !== 'radiator') return [slot.key];
  const count = slot.radiator?.fanCount ?? inferRadiatorFans(slot.size).count;
  return Array.from({ length: count }, (_, i) => radiatorFanKey(slot.key, i));
}

/** The stored bindings plus a derived one for every GPU fan slot and AIO radiator fan no binding names: the card's or cooler's own fan channels in order, the last one shared when fans outnumber channels. A stored binding, including a `none` one, always wins; a real binding on a radiator slot's own key also drives its other fans. The derived ones are never written back. */
export function withDefaultBindings(bindings: readonly FanBinding[], slots: readonly Pick<CaseFanSlot, 'key' | 'taken' | 'size' | 'radiator'>[], channels: readonly Pick<FanChannel, 'id' | 'isGpu' | 'isAio' | 'kind'>[]): FanBinding[] {
  const named = new Set(bindings.flatMap(b => b.slotKeys));
  const realOn = new Set(bindings.filter(b => b.channelId !== NO_FAN_CHANNEL).flatMap(b => b.slotKeys));
  const derived = new Map<string, string[]>();
  const assign = (keys: string[], owners: readonly Pick<FanChannel, 'id'>[]) => {
    if (owners.length === 0) return;
    keys.forEach((key, i) => {
      const id = owners[Math.min(i, owners.length - 1)].id;
      derived.set(id, [...(derived.get(id) ?? []), key]);
    });
  };
  const fans = (own: (c: Pick<FanChannel, 'isGpu' | 'isAio'>) => boolean) => channels.filter(c => own(c) && (c.kind ?? 'Fan') !== 'Pump');
  assign(slots.filter(sl => isGpuSlotKey(sl.key) && !named.has(sl.key)).map(sl => sl.key).sort((a, b) => gpuIndex(a) - gpuIndex(b)), fans(c => !!c.isGpu));
  const aioKeys = slots.filter(isAioSlot).flatMap(sl => slotFanKeys(sl).filter((key, i) => !named.has(key) && !(i > 0 && realOn.has(sl.key))));
  assign(aioKeys, fans(c => !!c.isAio));
  return [...bindings, ...[...derived].map(([channelId, keys]) => ({ channelId, slotKeys: keys }))];
}

/** Each slot's direction: the user's override, else the GPU's fans blow into the card (intake), else the position's default. */
export function slotDirections(slots: readonly Pick<CaseFanSlot, 'key' | 'position'>[], overrides: Readonly<Record<string, FanDirection>>): Record<string, FanDirection> {
  const out: Record<string, FanDirection> = {};
  for (const slot of slots) out[slot.key] = overrides[slot.key] ?? (isGpuSlotKey(slot.key) ? 'intake' : defaultDirection(slot.position));
  return out;
}

type LiveChannel = Pick<FanChannel, 'id' | 'rpm' | 'dutyPercent' | 'maxRpm' | 'rpmUnavailable'>;

/** Live speed of each fan that has a device bound, keyed by fan key: a channel's tach or a simulated `sim:<rpm>` id, both through the same share-of-top-speed rule. A radiator's extra fans follow the slot's own binding unless they are named themselves. A GPU or radiator fan that is unlinked, or a GPU fan nothing drives, is not turning; any other unbound fan has no entry. */
export function slotSpeeds(slots: readonly CaseFanSlot[], bindings: readonly FanBinding[], channels: readonly LiveChannel[]): Map<string, SlotSpeed> {
  const out = new Map<string, SlotSpeed>();
  for (const slot of slots) {
    const size = slot.taken === 'radiator' ? slot.size / Math.max(1, slot.radiator?.fanCount ?? 1) : slot.size;
    const topSpeed = slot.fan?.rpmMax ?? slot.radiator?.fanRpmMax;
    slotFanKeys(slot).forEach((key, i) => {
      let best: SlotSpeed | undefined;
      let unlinked = false;
      for (const b of bindings) {
        if (!b.slotKeys.includes(key)) continue;
        if (b.channelId === NO_FAN_CHANNEL) { unlinked = true; continue; }
        const rpm = simRpm(b.channelId);
        const live = channels.find(c => c.id === b.channelId) ?? (rpm !== null ? { rpm, dutyPercent: 0 } : null);
        if (!live) continue;
        const sp = speedFraction(live, topSpeed, size);
        if (!best || sp.fraction > best.fraction) best = sp;
      }
      if (!best && (unlinked || isGpuSlotKey(key))) best = { fraction: 0, estimated: true };
      if (!best && i > 0) best = out.get(slot.key);
      if (best) out.set(key, best);
    });
  }
  return out;
}

/** The slot keys whose binding names a channel that exists or a simulated one: those hold a physical fan even if the setup lists none. */
export function boundSlotKeys(bindings: readonly FanBinding[], channels: readonly Pick<FanChannel, 'id'>[]): string[] {
  const present = new Set(channels.map(c => c.id));
  return bindings.filter(b => present.has(b.channelId) || simRpm(b.channelId) !== null).flatMap(b => b.slotKeys);
}

/** The case-wide figures: fan laws on each fan's live speed, solved against the case's openings. GPU fans are left out: their air recirculates inside the case. */
export function lumpedModel(slots: readonly CaseFanSlot[], catalog: readonly CatalogFanSpec[], speeds: ReadonlyMap<string, SlotSpeed>, directions: Readonly<Record<string, FanDirection>>) {
  let estimated = false;
  const fans: PressureFan[] = [];
  for (const slot of slots) {
    if (isGpuSlotKey(slot.key)) continue;
    for (const fan of slotModelFans(slot, catalog)) {
      const speed = speeds.get(fan.key);
      const live = speed ? { ...scaledSpec(fan, speed.fraction), estimated: fan.estimated || speed.estimated } : fan;
      estimated ||= live.estimated;
      fans.push({ key: fan.key, cfm: live.cfm, staticMmH2O: live.staticMmH2O, direction: directions[slot.key] });
    }
  }
  return { result: solveCasePressure(fans), estimated, fanCount: fans.length };
}
