import type { CaseBox, CaseLayout } from '../caseLayout';
import { profileFor } from './caseProfiles';

export type ObstacleKind = 'panel' | 'gpu' | 'psu' | 'board' | 'part' | 'porous';

/** One thing the grid rasterizes: the same list drives the solver's cells and the collision view, so the two cannot differ. */
export interface Obstacle {
  kind: ObstacleKind;
  porous: boolean;
  box: CaseBox;
}

const KIND_OF: Readonly<Record<string, ObstacleKind>> = { gpu: 'gpu', psu: 'psu', motherboard: 'board' };

const longestSide = (box: CaseBox): number => {
  if (box.plate) {
    const [a, b] = [0, 1, 2].filter(i => i !== box.plate!.normal);
    return Math.max(box.size[a], box.size[b]);
  }
  return Math.max(...box.size);
};

/** The solid and porous obstacles of a layout for its case's profile; walls are the grid's own shell and are not listed. */
export function obstaclesOf(layout: CaseLayout): Obstacle[] {
  const profile = profileFor(layout.caseModel);
  const out: Obstacle[] = [];
  for (const box of layout.boxes) {
    if (box.role === 'ghost' || box.role === 'limit' || box.role === 'glass' || box.role === 'detail') continue;
    if (box.slot === 'case') {
      if (profile.structureMinSideMm === null || box.plate?.wall) continue;
      if (!box.plate && !box.faces) continue;
      if (longestSide(box) >= profile.structureMinSideMm) out.push({ kind: 'panel', porous: false, box });
    } else if (profile.porousParts.has(box.slot)) {
      out.push({ kind: 'porous', porous: true, box });
    } else if (profile.solidParts.has(box.slot)) {
      out.push({ kind: KIND_OF[box.slot] ?? 'part', porous: false, box });
    }
  }
  return out;
}
