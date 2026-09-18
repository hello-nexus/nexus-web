import type { HardwareSensor } from '../hooks/useSensors';

/** A GPU component as it arrives on the monitoring stream (`gpu` topic /
 *  MonitoringFrame.gpu). `vendor`/`integrated` are populated by the service. */
export interface GpuComponent {
  id: string;
  name: string;
  vendor?: string;
  integrated?: boolean;
  /** Windows adapter LUID ("HighPart:LowPart"); absent off Windows / unmatched. */
  adapterLuid?: string;
  sensors: HardwareSensor[];
}

/**
 * Pick the "primary" GPU from the broadcast list.
 *   - An explicit preference (the GPU's model name) wins while it still matches
 *     a present GPU; a stale name (hardware/driver change) falls through.
 *   - Otherwise default to the first discrete GPU, so machines with an iGPU +
 *     dGPU show the dGPU without any user action.
 *   - The final fallback (`gpus[0]`) covers single-GPU and all-integrated rigs.
 *
 * `preferredName` is the stored `cooling.preferredGpuId` ("" = auto).
 */
export function resolvePrimaryGpu<T extends { name: string; integrated?: boolean }>(
  gpus: readonly T[],
  preferredName: string,
): T | undefined {
  if (preferredName) {
    const match = gpus.find(g => g.name === preferredName);
    if (match) return match;
  }
  return gpus.find(g => !g.integrated) ?? gpus[0];
}

/**
 * Short tag telling one GPU from the others on the box, for sensor labels
 * that must stay narrow: "GPU" for a discrete card, "iGPU" for an integrated
 * one, numbered ("GPU 2", "iGPU 2") only when several of that kind exist.
 * Order is the service's broadcast order. A single-GPU box always gets
 * "GPU", so labels there read exactly as before; an unknown id also falls
 * back to "GPU". Independent of the primary-GPU preference, so a tag never
 * moves between cards when the user changes it.
 */
export function gpuTag<T extends { id: string; integrated?: boolean }>(gpus: readonly T[], gpuId: string): string {
  const owner = gpus.length > 1 ? gpus.find(g => g.id === gpuId) : undefined;
  if (!owner) return 'GPU';
  const kind = owner.integrated ? 'iGPU' : 'GPU';
  const ordinal = gpus.filter(g => !!g.integrated === !!owner.integrated).indexOf(owner);
  return ordinal > 0 ? `${kind} ${ordinal + 1}` : kind;
}

/** `gpuTag` for the GPU owning `sensorId` (ids are unique across GPUs); "GPU" when no GPU lists it. */
export function gpuTagForSensor(gpus: readonly GpuComponent[], sensorId: string): string {
  const owner = gpus.find(g => g.sensors.some(s => s.id === sensorId));
  return owner ? gpuTag(gpus, owner.id) : 'GPU';
}
