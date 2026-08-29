import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DetectedConflict } from '../api/conflicts';
import { fetchLightingDevices, setLightingDeviceControlled, type LightingDevice } from '../api/lighting';
import { useDevices, type DeviceListItem } from './useDevices';

export type ConflictDeviceOwner = 'nexus' | 'app' | 'mixed';

/** One hardware device a detected conflicting app and Nexus both drive. */
export interface ConflictDevice {
  key: string;
  name: string;
  /** Who drives it now: Nexus, the app, or a mix (some of its lighting cards ignored). */
  owner: ConflictDeviceOwner;
}

interface ConflictDeviceGroup extends ConflictDevice {
  /** Curated handler id flipped through /devices/control. */
  handlerId?: string;
  /** Lighting card ids flipped through /devices/lighting-devices/controlled. */
  lightingIds: string[];
}

const LIGHTING_POLL_MS = 3000;

function lightingGroupName(cards: readonly LightingDevice[], deviceId: string): string {
  const whole = cards.find(c => c.id === deviceId);
  if (whole) return whole.name;
  // Zone cards are named "<device> - <zone>"; show the device once, not every header.
  const first = cards[0].name;
  const sep = first.lastIndexOf(' - ');
  if (sep > 0) {
    const prefix = first.slice(0, sep);
    if (cards.every(c => c.name.startsWith(prefix))) return prefix;
  }
  return first;
}

function lightingGroupOwner(cards: readonly LightingDevice[]): ConflictDeviceOwner {
  const controlled = cards.filter(c => c.controlled !== false).length;
  if (controlled === cards.length) return 'nexus';
  if (controlled === 0) return 'app';
  return 'mixed';
}

/**
 * Joins the detected apps against both device populations that carry a
 * per-device Nexus Control flag: curated USB handlers (mapped to one app by
 * the service's DeviceControlPolicy) and OpenRGB lighting cards (tagged with
 * every app that competes for their vendor). A hub's own lighting cards fold
 * into the hub's row: its gate is what claims the hardware, and turning the
 * gate off drops those cards from the list. Lighting cards collapse to one
 * row per owning device so a split motherboard reads as one entry.
 */
export function deriveConflictDevices(
  conflicts: readonly DetectedConflict[],
  curated: readonly DeviceListItem[],
  lighting: readonly LightingDevice[],
): Map<string, ConflictDeviceGroup[]> {
  const result = new Map<string, ConflictDeviceGroup[]>();
  for (const conflict of conflicts) {
    const groups: ConflictDeviceGroup[] = [];
    for (const d of curated) {
      if (d.conflictAppId !== conflict.id || !d.connected || d.supportsNexusControl === false) continue;
      const cards = lighting.filter(c => c.controlHandlerId === d.id);
      groups.push({
        key: `device:${d.id}`,
        name: d.name,
        owner: d.nexusControlEnabled === false ? 'app' : lightingGroupOwner(cards) === 'nexus' ? 'nexus' : 'mixed',
        handlerId: d.id,
        lightingIds: cards.map(c => c.id),
      });
    }
    const byDevice = new Map<string, LightingDevice[]>();
    for (const card of lighting) {
      if (card.controlHandlerId || !card.conflictAppIds?.includes(conflict.id)) continue;
      const deviceId = card.deviceId || card.id;
      const bucket = byDevice.get(deviceId);
      if (bucket) bucket.push(card);
      else byDevice.set(deviceId, [card]);
    }
    for (const [deviceId, cards] of byDevice) {
      groups.push({
        key: `lighting:${deviceId}`,
        name: lightingGroupName(cards, deviceId),
        owner: lightingGroupOwner(cards),
        lightingIds: cards.map(c => c.id),
      });
    }
    result.set(conflict.id, groups);
  }
  return result;
}

export interface ConflictDevicesState {
  devicesByApp: ReadonlyMap<string, readonly ConflictDevice[]>;
  /** Flips every device listed under the app to the chosen owner. Resolves once every write settled. */
  setOwner: (conflictId: string, owner: 'nexus' | 'app') => Promise<void>;
}

/**
 * Live device ownership for the conflict surfaces. Curated devices ride the
 * `devices` topic through useDevices; lighting cards have no push topic, so
 * they poll while enabled (same cadence as the Lighting page) and update
 * optimistically on a write so the switch does not lag its own click.
 */
export function useConflictDevices(conflicts: readonly DetectedConflict[], enabled: boolean): ConflictDevicesState {
  const { devices: curated, controlDevice } = useDevices(enabled);
  const [lighting, setLighting] = useState<LightingDevice[]>([]);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refreshLighting = useCallback(async () => {
    const res = await fetchLightingDevices().catch(() => null);
    if (res && mountedRef.current) setLighting(res.devices);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refreshLighting();
    const timer = window.setInterval(() => { void refreshLighting(); }, LIGHTING_POLL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, refreshLighting]);

  const byApp = useMemo(
    () => deriveConflictDevices(conflicts, curated, lighting),
    [conflicts, curated, lighting],
  );

  const setOwner = useCallback(async (conflictId: string, owner: 'nexus' | 'app') => {
    const groups = byApp.get(conflictId) ?? [];
    const controlled = owner === 'nexus';
    const handlerIds = groups.flatMap(g => (g.handlerId ? [g.handlerId] : []));
    // A hub's cards are left alone when handing it to the app: the gate going
    // off already stops the frame writer and drops the cards, and an ignore
    // written now would survive the round trip and keep them dark once the
    // hub comes back.
    const lightingIds = groups.flatMap(g => (g.handlerId && !controlled ? [] : g.lightingIds));
    const lightingSet = new Set(lightingIds);
    setLighting(prev => prev.map(d => (lightingSet.has(d.id) ? { ...d, controlled } : d)));
    await Promise.allSettled([
      ...handlerIds.map(id => controlDevice(id, controlled)),
      ...lightingIds.map(id => setLightingDeviceControlled(id, controlled)),
    ]);
    await refreshLighting();
  }, [byApp, controlDevice, refreshLighting]);

  return { devicesByApp: byApp, setOwner };
}
