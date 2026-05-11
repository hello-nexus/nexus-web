import type { CurvePoint } from '../api/cooling';

/**
 * Shared cooling-view types. The same shapes are used by CurveEditor,
 * FanCard and the CoolingView composer; extracted here so each file has
 * one import instead of pulling from the others.
 */

export type CurveType = 'flat' | 'linear' | 'graph' | 'mix';
export type MixFn = 'min' | 'max' | 'avg' | 'sum';

/**
 * Marks the shared preset curve. When set, this curve is the single
 * Silent / Balanced / Performance curve attached to all fans whenever the
 * matching preset is active. Independent of CurveType so a preset curve
 * can be Linear today and Graph tomorrow without losing its preset
 * identity.
 */
export type CurvePreset = 'silent' | 'balanced' | 'performance';

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
}

export interface FanState {
  softwareControl: boolean;
  curveId: string | null;
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
