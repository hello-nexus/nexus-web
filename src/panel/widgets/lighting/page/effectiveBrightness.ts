export interface BrightnessInputs {
  /** Master slider, 0..100. */
  master: number;
  /** The schedule's level, 0..100, only while lighting follows it; null otherwise. */
  schedule: number | null;
  /** The device's own brightness, 0..100. */
  device: number;
  /** Master multiplies the device instead of capping it. */
  scales: boolean;
}

/**
 * The percent that scales a device's LED bytes: the master capped by the
 * schedule, joined to the device level the way the service joins them
 * (MasterBrightness.Combine). Idle dim is not part of it; the service does not
 * publish its ramp.
 */
export function effectiveBrightness({ master, schedule, device, scales }: BrightnessInputs): number {
  const level = schedule === null ? master : Math.min(master, schedule);
  const joined = scales ? (device * level) / 100 : Math.min(device, level);
  return Math.round(Math.max(0, Math.min(100, joined)));
}

export type BrightnessCauseKind = 'device' | 'schedule' | 'master';

export interface BrightnessCause { kind: BrightnessCauseKind; level: number }

/** The controls currently below full, in the order the tooltip lists them. */
export function brightnessCauses({ master, schedule, device }: BrightnessInputs): BrightnessCause[] {
  const all: BrightnessCause[] = [
    { kind: 'device', level: device },
    { kind: 'schedule', level: schedule ?? 100 },
    { kind: 'master', level: master },
  ];
  return all.filter(c => c.level < 100);
}
