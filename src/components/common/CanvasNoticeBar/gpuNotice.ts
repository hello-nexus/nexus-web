export type GpuState = 'ready' | 'initializing' | 'unavailable';

/**
 * i18n key for the canvas GPU notice, or null when there is nothing to say.
 *
 * "Initializing" and "unavailable" look identical on the devices - every
 * lighting mode is shader-rendered, so both are simply black - but one resolves
 * itself and the other needs the user to pick a different card.
 *
 * `available` is the pre-tri-state field, kept so a newer UI against an older
 * service still says something sensible.
 */
export function gpuNoticeKey(
  state: GpuState | undefined,
  available: boolean | undefined,
): string | null {
  const resolved: GpuState = state ?? (available === false ? 'unavailable' : 'ready');
  if (resolved === 'ready') return null;
  return resolved === 'initializing'
    ? 'lighting.gpuInitializingNotice'
    : 'lighting.gpuUnavailableNotice';
}
