import type { CaseBox, CaseChamfer, CaseLayout, Vec3 } from '../caseLayout';

/** Chamfers with a shorter leg than this are trim, not shape: the airflow ignores them. */
const MIN_CUT_LEG_MM = 30;

/** The case's outer shell box: the chamfered `case` structure box that spans the layout's extents (box sizes are [depth, height, width]). */
function shellOf(layout: CaseLayout): CaseBox | undefined {
  const [d, w, h] = layout.size;
  return layout.boxes.find(b => b.slot === 'case' && b.chamfers && b.size[0] >= d * 0.9 && b.size[1] >= h * 0.9 && b.size[2] >= w * 0.9);
}

/** The wedge a chamfer takes off the shell, as a closed prism of planar faces. Legs follow the shell's own test: `legB` runs along axis a, `legA` along axis b. */
function wedgeOf(shell: CaseBox, c: CaseChamfer): CaseBox {
  const third = [0, 1, 2].find(i => i !== c.a && i !== c.b)!;
  const corner: Vec3 = [0, 0, 0];
  corner[c.a] = c.aMax ? shell.min[c.a] + shell.size[c.a] : shell.min[c.a];
  corner[c.b] = c.bMax ? shell.min[c.b] + shell.size[c.b] : shell.min[c.b];
  const pointAt = (along: number, across: number, depth: number): Vec3 => {
    const p: Vec3 = [0, 0, 0];
    p[c.a] = corner[c.a] + (c.aMax ? -along : along);
    p[c.b] = corner[c.b] + (c.bMax ? -across : across);
    p[third] = shell.min[third] + depth;
    return p;
  };
  const len = shell.size[third];
  const tri = (depth: number): Vec3[] => [pointAt(0, 0, depth), pointAt(c.legB, 0, depth), pointAt(0, c.legA, depth)];
  const lo = tri(0);
  const hi = tri(len);
  const side = (i: number, j: number): Vec3[] => [lo[i], lo[j], hi[j], hi[i]];
  const min: Vec3 = [0, 0, 0];
  const size: Vec3 = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const vals = [...lo, ...hi].map(p => p[k]);
    min[k] = Math.min(...vals);
    size[k] = Math.max(...vals) - min[k];
  }
  return { slot: 'case', role: 'structure', min, size, faces: [lo, hi, side(0, 1), side(1, 2), side(2, 0)] };
}

/** The prisms the case's shape cuts from its bounding box, one per large chamfer of the shell. */
export function hullCuts(layout: CaseLayout): CaseBox[] {
  const shell = shellOf(layout);
  return (shell?.chamfers ?? []).filter(c => Math.min(c.legA, c.legB) >= MIN_CUT_LEG_MM && !c.round).map(c => wedgeOf(shell!, c));
}
