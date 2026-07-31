// Pure draft/diff helpers for the Q-series "Cooler firmware" section: the
// onboard pump/fan curves plus the firmware-mode LED animation. Kept free of
// React so save/reset dirty state and diff-write planning are unit-testable
// without mounting the component.

import type { CurvePoint } from '../../../api/cooling';
import { QSERIES_FW_ANIMATION_COLOR, type QSeriesFirmwareAnimation } from '../../../api/qseries';

export const QSERIES_DEFAULT_ANIMATION: QSeriesFirmwareAnimation = {
  animation: QSERIES_FW_ANIMATION_COLOR,
  r: 255,
  g: 255,
  b: 255,
  brightness: 100,
};

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

export interface QSeriesFactoryStateInput {
  turboOn: boolean;
  curveSupported: boolean;
  draftPump: readonly CurvePoint[];
  draftFan: readonly CurvePoint[];
  devicePump: readonly CurvePoint[];
  deviceFan: readonly CurvePoint[];
  defaultPump: readonly CurvePoint[];
  defaultFan: readonly CurvePoint[];
  animationSupported: boolean;
  draftAnimation: QSeriesFirmwareAnimation | null;
  deviceAnimation: QSeriesFirmwareAnimation | null;
}

/**
 * True when a factory reset would be a no-op: turbo is already off, and for
 * every supported resource BOTH the local draft and the last-known device
 * value already match the default. Either side disagreeing means Reset has
 * something real to do (revert an unsaved draft, or write the device).
 */
export function isAtFactoryDefaults(input: QSeriesFactoryStateInput): boolean {
  if (input.turboOn) return false;
  if (input.curveSupported) {
    const draftOk = curvesEqual(input.draftPump, input.defaultPump) && curvesEqual(input.draftFan, input.defaultFan);
    const deviceOk = curvesEqual(input.devicePump, input.defaultPump) && curvesEqual(input.deviceFan, input.defaultFan);
    if (!draftOk || !deviceOk) return false;
  }
  if (input.animationSupported) {
    const draftOk = animationsEqual(input.draftAnimation, QSERIES_DEFAULT_ANIMATION);
    const deviceOk = animationsEqual(input.deviceAnimation, QSERIES_DEFAULT_ANIMATION);
    if (!draftOk || !deviceOk) return false;
  }
  return true;
}

export interface QSeriesResetWritesInput {
  deviceTurboOn: boolean;
  curveSupported: boolean;
  devicePump: readonly CurvePoint[];
  deviceFan: readonly CurvePoint[];
  defaultPump: readonly CurvePoint[];
  defaultFan: readonly CurvePoint[];
  animationSupported: boolean;
  deviceAnimation: QSeriesFirmwareAnimation | null;
}

export interface QSeriesResetWritesPlan {
  writeTurboOff: boolean;
  writeCurve: boolean;
  writeAnimation: boolean;
}

/**
 * Reset only writes a resource whose last-known DEVICE value differs from
 * the factory default - never the local draft - so a resource already at
 * factory default is skipped even if the draft had drifted from it. A null
 * device animation (not yet loaded, or a read that failed) also skips the
 * write: unconfirmed device state must never be overwritten blind.
 */
export function planResetWrites(input: QSeriesResetWritesInput): QSeriesResetWritesPlan {
  return {
    writeTurboOff: input.deviceTurboOn,
    writeCurve: input.curveSupported
      && !(curvesEqual(input.devicePump, input.defaultPump) && curvesEqual(input.deviceFan, input.defaultFan)),
    writeAnimation: input.animationSupported
      && input.deviceAnimation !== null
      && !animationsEqual(input.deviceAnimation, QSERIES_DEFAULT_ANIMATION),
  };
}
