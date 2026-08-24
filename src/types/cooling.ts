import type { CurvePoint, CurvesResponse } from '../api/cooling';

/**
 * Shared cooling-view types. The same shapes are used by CurveEditor,
 * FanCard and the CoolingPage composer; extracted here so each file has
 * one import instead of pulling from the others.
 */

export type CurveType = 'flat' | 'linear' | 'multipoint' | 'mix' | 'trigger' | 'sync' | 'auto';
export type MixFn = 'min' | 'max' | 'avg' | 'sum' | 'subtract';

/**
 * Marks the shared preset curve. When set, this curve is the single
 * Silent / Balanced / Turbo curve attached to all fans whenever the
 * matching preset is active. Independent of CurveType so a preset curve
 * can change its Type without losing its preset identity.
 */
export type CurvePreset = 'silent' | 'balanced' | 'turbo';

export interface CurveDef {
  id: string;
  name: string;
  type: CurveType;
  sourceId: string;
  flat: { speed: number };
  linear: { responseTime: number; minTemp: number; maxTemp: number; minSpeed: number; maxSpeed: number };
  // The multi-point curve. Persisted to the service as the wire "Graph" type /
  // `graph` object (see curveDefsFromApi + pushCurves).
  multipoint: { responseTime: number; points: CurvePoint[] };
  mix: { responseTime: number; curveIds: string[]; fn: MixFn };
  // Two-state latch: steps to loadSpeed once the source sits above loadTemp for
  // responseTime, back to idleSpeed once it sits below idleTemp, and holds in
  // between.
  trigger: { responseTime: number; idleTemp: number; loadTemp: number; idleSpeed: number; loadSpeed: number };
  // Mirrors another fan channel's duty, either scaled (proportional) or shifted
  // by a number of duty points.
  sync: { sourceChannelId: string; offset: number; proportional: boolean };
  // Stepping controller that holds a target temperature.
  auto: { responseTime: number; idleTemp: number; loadTemp: number; minSpeed: number; maxSpeed: number; step: number; deadband: number };
  preset?: CurvePreset;
  /** For preset curves only: true when the curve's Type + Linear params still
   *  match the service's PresetDefaults. Computed server-side and shipped on
   *  /cooling/curves so the FE doesn't have to mirror PresetDefaults locally. */
  isDefault?: boolean;
}

export interface FanState {
  softwareControl: boolean;
  curveId: string | null;
}

// Hard cap on user-created curves. The picker UI starts to crowd past this,
// and a curve list has fewer real use cases than fan channels do.
export const MAX_CURVES = 10;

/**
 * Adapt /cooling/curves wire curves ("input.id", "Flat|Linear|Graph|Mixed")
 * to the shared CurveDef shape that computeCurveSpeed and the editors expect.
 * The wire "Graph" type + `graph` object map to the local `multipoint` field.
 */
export function curveDefsFromApi(saved: CurvesResponse | null): CurveDef[] {
  if (!saved?.curves?.length) return [];
  return saved.curves.map(c => ({
    id: c.id,
    name: c.name,
    type: wireTypeToCurveType(c.type),
    sourceId: c.input?.id ?? '',
    flat: { speed: c.flat?.speed ?? 50 },
    linear: {
      responseTime: c.linear?.responseTime ?? 1.5,
      minTemp: c.linear?.minTemp ?? 35,
      maxTemp: c.linear?.maxTemp ?? 75,
      minSpeed: c.linear?.minSpeed ?? 30,
      maxSpeed: c.linear?.maxSpeed ?? 90,
    },
    multipoint: {
      responseTime: c.graph?.responseTime ?? 1.5,
      points: c.graph?.points?.length ? c.graph.points : [
        { temp: 30, speed: 25 }, { temp: 45, speed: 33 }, { temp: 60, speed: 63 },
        { temp: 75, speed: 92 }, { temp: 90, speed: 100 },
      ],
    },
    mix: {
      // Default matches the backend MixedCurveData / MixedCurve default so
      // curves persisted before this field existed don't display a value the
      // engine isn't actually using.
      responseTime: c.mixed?.responseTime ?? 1.0,
      curveIds: c.mixed?.curveIds ?? [],
      fn: (c.mixed?.fn ?? 'max') as MixFn,
    },
    trigger: {
      responseTime: c.trigger?.responseTime ?? 3,
      idleTemp: c.trigger?.idleTemp ?? 45,
      loadTemp: c.trigger?.loadTemp ?? 65,
      idleSpeed: c.trigger?.idleSpeed ?? 30,
      loadSpeed: c.trigger?.loadSpeed ?? 80,
    },
    sync: {
      sourceChannelId: c.sync?.sourceChannelId ?? '',
      offset: c.sync?.offset ?? 0,
      proportional: c.sync?.proportional ?? false,
    },
    auto: {
      responseTime: c.auto?.responseTime ?? 5,
      idleTemp: c.auto?.idleTemp ?? 40,
      loadTemp: c.auto?.loadTemp ?? 70,
      minSpeed: c.auto?.minSpeed ?? 25,
      maxSpeed: c.auto?.maxSpeed ?? 100,
      step: c.auto?.step ?? 5,
      deadband: c.auto?.deadband ?? 2,
    },
    preset: c.preset ? (c.preset as CurvePreset) : undefined,
    isDefault: c.isDefault ?? undefined,
  }));
}

/** Wire type string to the local CurveType. Unknown types fall back to mix, matching the previous behaviour. */
function wireTypeToCurveType(type: string): CurveType {
  switch (type) {
    case 'Flat': return 'flat';
    case 'Linear': return 'linear';
    case 'Graph': return 'multipoint';
    case 'Trigger': return 'trigger';
    case 'Sync': return 'sync';
    case 'Auto': return 'auto';
    default: return 'mix';
  }
}

const WIRE_TYPES: Record<CurveType, string> = {
  flat: 'Flat',
  linear: 'Linear',
  multipoint: 'Graph',
  mix: 'Mixed',
  trigger: 'Trigger',
  sync: 'Sync',
  auto: 'Auto',
};

/**
 * CurveDef to the wire shape POST /cooling/curves/set takes. Every mode's
 * params ride along, not just the active type's, so switching type and back
 * does not reset the others to defaults on the next refetch; the engine applies
 * only the one named by `type`. The local `multipoint` mode is the wire's
 * "Graph".
 */
export function curveDefToApi(c: CurveDef, outputs: Array<{ id: string; type: string }>) {
  return {
    id: c.id,
    name: c.name,
    type: WIRE_TYPES[c.type],
    input: { id: c.sourceId, type: 'Temperature', device: '' },
    outputs,
    flat: { speed: c.flat.speed },
    linear: c.linear,
    graph: { responseTime: c.multipoint.responseTime, speedModifier: 1, points: c.multipoint.points },
    mixed: { responseTime: c.mix.responseTime, curveIds: c.mix.curveIds, fn: c.mix.fn },
    trigger: c.trigger,
    sync: c.sync,
    auto: c.auto,
    preset: c.preset ?? null,
  };
}

/**
 * Fills in any mode object a CurveDef is missing. A curve read back from a
 * cache written by an older build has no object for a mode that did not exist
 * then, and the editor reads `curve.<mode>.<field>` unconditionally - which is
 * a crash, not a missing value. Adding a mode should not be able to break a
 * page for everyone who visited it before.
 */
export function withCurveDefaults(curve: CurveDef): CurveDef {
  const defaults = newCurve(curve.id);
  return {
    ...defaults,
    ...curve,
    flat: { ...defaults.flat, ...curve.flat },
    linear: { ...defaults.linear, ...curve.linear },
    multipoint: { ...defaults.multipoint, ...curve.multipoint },
    mix: { ...defaults.mix, ...curve.mix },
    trigger: { ...defaults.trigger, ...curve.trigger },
    sync: { ...defaults.sync, ...curve.sync },
    auto: { ...defaults.auto, ...curve.auto },
  };
}

export function newCurve(id: string): CurveDef {
  return {
    id, name: `Curve ${id.slice(-4)}`, type: 'multipoint', sourceId: '',
    flat: { speed: 50 },
    linear: { responseTime: 1.5, minTemp: 35, maxTemp: 75, minSpeed: 30, maxSpeed: 90 },
    multipoint: { responseTime: 1.5, points: [{ temp: 30, speed: 25 }, { temp: 45, speed: 33 }, { temp: 60, speed: 63 }, { temp: 75, speed: 92 }, { temp: 90, speed: 100 }] },
    mix: { responseTime: 1.5, curveIds: [], fn: 'max' },
    trigger: { responseTime: 3, idleTemp: 45, loadTemp: 65, idleSpeed: 30, loadSpeed: 80 },
    sync: { sourceChannelId: '', offset: 0, proportional: false },
    auto: { responseTime: 5, idleTemp: 40, loadTemp: 70, minSpeed: 25, maxSpeed: 100, step: 5, deadband: 2 },
  };
}
