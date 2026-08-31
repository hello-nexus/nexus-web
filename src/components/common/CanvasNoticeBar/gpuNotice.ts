export type GpuState = 'ready' | 'initializing' | 'unavailable';

/** `wait` resolves itself; `fault` needs the user to act. */
export type GpuNoticeTone = 'wait' | 'fault';

export interface GpuNotice {
  key: string;
  tone: GpuNoticeTone;
}

/**
 * Canvas GPU notice, or null when there is nothing to say. `available` is the
 * pre-tri-state field, so a newer UI against an older service still says
 * something sensible.
 */
export function gpuNotice(
  state: GpuState | undefined,
  available: boolean | undefined,
): GpuNotice | null {
  const resolved: GpuState = state ?? (available === false ? 'unavailable' : 'ready');
  if (resolved === 'ready') return null;
  return resolved === 'initializing'
    ? { key: 'lighting.gpuInitializingNotice', tone: 'wait' }
    : { key: 'lighting.gpuUnavailableNotice', tone: 'fault' };
}
