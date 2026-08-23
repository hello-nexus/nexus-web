// Pure equality helpers for the Q-series firmware sections: the onboard
// pump/fan curves and the firmware LED animation. Kept free of React so the
// save-button dirty state is unit-testable without mounting the component.

import type { CurvePoint } from '../../../api/cooling';
import type { QSeriesFirmwareAnimation } from '../../../api/qseries';

/** Compares rounded to whole degrees/percent - the units the API and the UI both use. */
export function curvesEqual(a: readonly CurvePoint[], b: readonly CurvePoint[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((p, i) => Math.round(p.temp) === Math.round(b[i].temp) && Math.round(p.speed) === Math.round(b[i].speed));
}

export function animationsEqual(
  a: QSeriesFirmwareAnimation | null,
  b: QSeriesFirmwareAnimation | null,
): boolean {
  if (!a || !b) return a === b;
  return a.animation === b.animation && a.r === b.r && a.g === b.g && a.b === b.b && a.brightness === b.brightness;
}
