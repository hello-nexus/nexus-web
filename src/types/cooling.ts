import type { CurvePoint, CurvesResponse } from '../api/cooling';

/**
 * Shared cooling-view types. The same shapes are used by CurveEditor,
 * FanCard and the CoolingPage composer; extracted here so each file has
 * one import instead of pulling from the others.
 */

export type CurveType = 'flat' | 'linear' | 'graph' | 'mix';
export type MixFn = 'min' | 'max' | 'avg' | 'sum';

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
  graph: { responseTime: number; points: CurvePoint[] };
  mix: { responseTime: number; curveIds: string[]; fn: MixFn };
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
 */
export function curveDefsFromApi(saved: CurvesResponse | null): CurveDef[] {
  if (!saved?.curves?.length) return [];
  return saved.curves.map(c => ({
    id: c.id,
    name: c.name,
    type: (c.type === 'Flat' ? 'flat' : c.type === 'Linear' ? 'linear' : c.type === 'Graph' ? 'graph' : 'mix') as CurveType,
    sourceId: c.input?.id ?? '',
    flat: { speed: c.flat?.speed ?? 50 },
    linear: {
      responseTime: c.linear?.responseTime ?? 1.5,
      minTemp: c.linear?.minTemp ?? 35,
      maxTemp: c.linear?.maxTemp ?? 75,
      minSpeed: c.linear?.minSpeed ?? 30,
      maxSpeed: c.linear?.maxSpeed ?? 90,
    },
    graph: {
      responseTime: c.graph?.responseTime ?? 1.5,
      points: c.graph?.points?.length ? c.graph.points : [
        { temp: 30, speed: 25 }, { temp: 50, speed: 40 },
        { temp: 70, speed: 70 }, { temp: 90, speed: 100 },
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
    preset: c.preset ? (c.preset as CurvePreset) : undefined,
    isDefault: c.isDefault ?? undefined,
  }));
}

export function newCurve(id: string): CurveDef {
  return {
    id, name: `Curve ${id.slice(-4)}`, type: 'flat', sourceId: '',
    flat: { speed: 50 },
    linear: { responseTime: 1.5, minTemp: 35, maxTemp: 75, minSpeed: 30, maxSpeed: 90 },
    graph: { responseTime: 1.5, points: [{ temp: 30, speed: 25 }, { temp: 50, speed: 40 }, { temp: 70, speed: 70 }, { temp: 90, speed: 100 }] },
    mix: { responseTime: 1.5, curveIds: [], fn: 'max' },
  };
}
