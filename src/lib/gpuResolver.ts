import type { HardwareSensor } from '../hooks/useSensors';

/** A GPU component as it arrives on the monitoring stream (`gpu` topic /
 *  MonitoringFrame.gpu). `vendor`/`integrated` are populated by the service. */
export interface GpuComponent {
  id: string;
  name: string;
  vendor?: string;
  integrated?: boolean;
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
