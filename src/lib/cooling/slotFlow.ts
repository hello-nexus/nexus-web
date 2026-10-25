import type { FanChannel } from '../../api/cooling';
import { defaultDirection, type CaseFanSlot, type FanBinding } from './caseLayout';
import { simRpm, speedFraction, type SlotSpeed } from './fanSpeed';
import { slotModelFans, type CatalogFanSpec } from './fanSpecs';
import { solveCasePressure, type FanDirection, type PressureFan } from './pressureModel';

export const GPU_FAN_PREFIX = 'gpu:fan:';
/** A binding to this id says the user unlinked the fan, so no default applies to its slots. */
export const NO_FAN_CHANNEL = 'none';

export const isGpuSlotKey = (key: string): boolean => key.startsWith(GPU_FAN_PREFIX);

const gpuIndex = (key: string): number => Number.parseInt(key.slice(GPU_FAN_PREFIX.length), 10) || 0;

/** The stored bindings plus a derived one for every GPU fan slot no binding names: the GPU's own fan channels in order, the last one shared when slots outnumber channels. Never written back. */
export function withGpuDefaults(bindings: readonly FanBinding[], slotKeys: readonly string[], channels: readonly Pick<FanChannel, 'id' | 'isGpu' | 'kind'>[]): FanBinding[] {
  const gpu = channels.filter(c => c.isGpu && (c.kind ?? 'Fan') !== 'Pump');
  if (gpu.length === 0) return [...bindings];
  const named = new Set(bindings.flatMap(b => b.slotKeys));
  const open = slotKeys.filter(k => isGpuSlotKey(k) && !named.has(k)).sort((a, b) => gpuIndex(a) - gpuIndex(b));
  const derived = new Map<string, string[]>();
  open.forEach((key, i) => {
    const id = gpu[Math.min(i, gpu.length - 1)].id;
    derived.set(id, [...(derived.get(id) ?? []), key]);
  });
  return [...bindings, ...[...derived].map(([channelId, keys]) => ({ channelId, slotKeys: keys }))];
}

/** Each slot's direction: the user's override, else the GPU's fans blow into the card (intake), else the position's default. */
export function slotDirections(slots: readonly Pick<CaseFanSlot, 'key' | 'position'>[], overrides: Readonly<Record<string, FanDirection>>): Record<string, FanDirection> {
  const out: Record<string, FanDirection> = {};
  for (const slot of slots) out[slot.key] = overrides[slot.key] ?? (isGpuSlotKey(slot.key) ? 'intake' : defaultDirection(slot.position));
  return out;
}

type LiveChannel = Pick<FanChannel, 'id' | 'rpm' | 'dutyPercent' | 'maxRpm' | 'rpmUnavailable'>;

/** Live speed of each slot that has a device bound: a channel's tach or a simulated `sim:<rpm>` id, both through the same share-of-top-speed rule. Unbound slots have no entry. */
export function slotSpeeds(slots: readonly CaseFanSlot[], bindings: readonly FanBinding[], channels: readonly LiveChannel[]): Map<string, SlotSpeed> {
  const out = new Map<string, SlotSpeed>();
  for (const slot of slots) {
    let best: SlotSpeed | undefined;
    for (const b of bindings) {
      if (!b.slotKeys.includes(slot.key)) continue;
      const rpm = simRpm(b.channelId);
      const live = channels.find(c => c.id === b.channelId) ?? (rpm !== null ? { rpm, dutyPercent: 0 } : null);
      if (!live) continue;
      const size = slot.taken === 'radiator' ? slot.size / Math.max(1, slot.radiator?.fanCount ?? 1) : slot.size;
      const sp = speedFraction(live, slot.fan?.rpmMax ?? slot.radiator?.fanRpmMax, size);
      if (!best || sp.fraction > best.fraction) best = sp;
    }
    if (best) out.set(slot.key, best);
  }
  return out;
}

/** The slot keys whose binding names a channel that exists or a simulated one: those hold a physical fan even if the setup lists none. */
export function boundSlotKeys(bindings: readonly FanBinding[], channels: readonly Pick<FanChannel, 'id'>[]): string[] {
  const present = new Set(channels.map(c => c.id));
  return bindings.filter(b => present.has(b.channelId) || simRpm(b.channelId) !== null).flatMap(b => b.slotKeys);
}

/** The case-wide figures: fan laws on each fan's live speed, solved against the case's openings. */
export function lumpedModel(slots: readonly CaseFanSlot[], catalog: readonly CatalogFanSpec[], speeds: ReadonlyMap<string, SlotSpeed>, directions: Readonly<Record<string, FanDirection>>) {
  let estimated = false;
  const fans: PressureFan[] = [];
  for (const slot of slots) {
    for (const fan of slotModelFans(slot, catalog, speeds.get(slot.key))) {
      estimated ||= fan.estimated;
      fans.push({ key: fan.key, cfm: fan.cfm, staticMmH2O: fan.staticMmH2O, direction: directions[slot.key] });
    }
  }
  return { result: solveCasePressure(fans), estimated, fanCount: fans.length };
}
