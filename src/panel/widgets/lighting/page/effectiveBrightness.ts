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

/**
 * The controls that set the result, in the order the tooltip lists them. Master
 * and schedule are both caps on the same level, so whichever is lower binds (a
 * tie lists both). Without scaling the device joins the same min; with scaling
 * it multiplies, so it counts whenever it is below full.
 */
export function brightnessCauses({ master, schedule, device, scales }: BrightnessInputs): BrightnessCause[] {
  const sched = schedule ?? 100;
  const cap = Math.min(master, sched);
  const target = scales ? cap : Math.min(device, cap);
  const causes: BrightnessCause[] = [];
  if (scales ? device < 100 : device === target && device < 100) causes.push({ kind: 'device', level: device });
  if (sched === cap && cap < 100 && (scales || cap === target)) causes.push({ kind: 'schedule', level: sched });
  if (master === cap && cap < 100 && (scales || cap === target)) causes.push({ kind: 'master', level: master });
  return causes;
}
