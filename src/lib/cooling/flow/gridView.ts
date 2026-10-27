import { BoxGeometry, BufferGeometry, EdgesGeometry, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments, Points, PointsMaterial } from 'three';
import type { FlowScene } from './gridScene';

/** Dev-tools view of the grid and how it is used: the lattice bounds and one point per solid, porous, fan-forced and outside-the-case air cell. Plain fluid cells inside the case are left out and outside air is thinned, so the view stays cheap. Layout mm, like the streaks. */
export interface GridView {
  group: Group;
  dispose: () => void;
}

const SOLID = [1, 0.35, 0.3];
const POROUS = [0.3, 0.6, 1];
const FAN = [0.35, 1, 0.45];
const OUTSIDE = [0.7, 0.7, 0.7];

export function buildGridView(scene: FlowScene): GridView {
  const [nx, ny, nz] = scene.dims;
  const { cellMm, origin, caseMin, caseMax } = scene;
  const positions: number[] = [];
  const colors: number[] = [];
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = i + nx * (j + ny * k);
    let color: number[] | null = null;
    if (scene.solid[c]) color = SOLID;
    else if (scene.darcy[c] > 0) color = POROUS;
    else if (scene.fanCell[c]) color = FAN;
    // Outside air is the bulk of the grid, so it is thinned to a regular subset.
    else if ((i + j + k) % 4 === 0 && (i < caseMin[0] || i > caseMax[0] || j < caseMin[1] || j > caseMax[1] || k < caseMin[2] || k > caseMax[2])) color = OUTSIDE;
    if (!color) continue;
    positions.push((i + 0.5) * cellMm - origin[0], (j + 0.5) * cellMm - origin[1], (k + 0.5) * cellMm - origin[2]);
    colors.push(color[0], color[1], color[2]);
  }
  const points = new BufferGeometry();
  points.setAttribute('position', new Float32BufferAttribute(positions, 3));
  points.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const pointMaterial = new PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.45, depthWrite: false });
  const box = new BoxGeometry(nx * cellMm, ny * cellMm, nz * cellMm);
  const edges = new EdgesGeometry(box);
  box.dispose();
  const lineMaterial = new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
  const lattice = new LineSegments(edges, lineMaterial);
  lattice.position.set((nx * cellMm) / 2 - origin[0], (ny * cellMm) / 2 - origin[1], (nz * cellMm) / 2 - origin[2]);
  const group = new Group();
  group.add(new Points(points, pointMaterial), lattice);
  return { group, dispose: () => { points.dispose(); pointMaterial.dispose(); edges.dispose(); lineMaterial.dispose(); } };
}
