import { useCallback, useEffect, useState } from 'react';
import { fetchPanelDevices, type PanelDeviceRecord } from '../api/panel';
import { useTopicCallback } from './useMultiplexSocket';

/**
 * Which effects/slots are in use as a panel background, across every paired
 * panel. Drives the "used by a panel" badge so a user editing a preset knows
 * other surfaces share it. Refreshes on the `panel/device` topic.
 */
export interface PanelBackgroundUsage {
  /** Effects used as a shader background by ≥1 panel. */
  effects: Set<string>;
  /** Slot indices used per effect across all panels. */
  slotsByEffect: Map<string, Set<number>>;
}

const EMPTY: PanelBackgroundUsage = { effects: new Set(), slotsByEffect: new Map() };

export function buildUsage(devices: PanelDeviceRecord[], excludeId?: string | null): PanelBackgroundUsage {
  const effects = new Set<string>();
  const slotsByEffect = new Map<string, Set<number>>();
  for (const d of devices) {
    // Skip the panel being edited: the badge means "ANOTHER surface uses this".
    if (excludeId && d.id === excludeId) continue;
    if (d.backgroundMode !== 'shader' || !d.backgroundEffect) continue;
    effects.add(d.backgroundEffect);
    const slot = Math.max(0, d.backgroundTemplate ?? 0);
    const set = slotsByEffect.get(d.backgroundEffect) ?? new Set<number>();
    set.add(slot);
    slotsByEffect.set(d.backgroundEffect, set);
  }
  return { effects, slotsByEffect };
}

/**
 * @param excludeDeviceId Panel to omit from the tally (the one currently being
 *   edited), so its own background never badges itself. Omit on the LED control.
 */
export function usePanelBackgroundUsage(excludeDeviceId?: string | null, enabled = true): PanelBackgroundUsage {
  const [usage, setUsage] = useState<PanelBackgroundUsage>(EMPTY);

  const reload = useCallback(() => {
    fetchPanelDevices()
      .then(res => { if (res) setUsage(buildUsage(res.devices, excludeDeviceId)); })
      .catch(() => {});
  }, [excludeDeviceId]);

  useEffect(() => {
    if (!enabled) { setUsage(EMPTY); return; }
    reload();
  }, [enabled, reload]);

  useTopicCallback('panel/device', enabled, reload);

  return usage;
}
