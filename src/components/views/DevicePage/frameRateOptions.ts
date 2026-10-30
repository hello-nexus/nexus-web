/** Caps offered under a device's own rate, highest first. */
export const FRAME_RATE_CAPS_FPS = [30, 20, 15, 10, 5, 1] as const;

/** Select value of "no cap": the device runs at its own rate. */
export const FRAME_RATE_OFF = '';

export interface FrameRateOption {
  value: string;
  /** Null for the no-cap option, whose label names the device max. */
  fps: number | null;
}

/**
 * Options for the per-device Frame rate select: the no-cap entry, then every preset below the
 * device max. A stored cap outside the presets that still limits the device stays listed so the
 * select shows what is applied.
 */
export function frameRateOptions(maxFps: number, storedCap: number | null | undefined): FrameRateOption[] {
  const caps = new Set<number>(FRAME_RATE_CAPS_FPS.filter(fps => fps < maxFps));
  if (typeof storedCap === 'number' && storedCap >= 1 && storedCap < maxFps) caps.add(storedCap);
  return [
    { value: FRAME_RATE_OFF, fps: null },
    ...[...caps].sort((a, b) => b - a).map(fps => ({ value: String(fps), fps })),
  ];
}

/** The select value for a stored cap: a cap at or above the device max limits nothing, so it reads as no cap. */
export function frameRateValue(maxFps: number, storedCap: number | null | undefined): string {
  return typeof storedCap === 'number' && storedCap >= 1 && storedCap < maxFps ? String(storedCap) : FRAME_RATE_OFF;
}

/** The cap to send for a select value; 0 clears the stored cap. */
export function frameRateFromValue(value: string): number {
  const fps = Number(value);
  return Number.isFinite(fps) && fps >= 1 ? fps : 0;
}
