import { BoxGeometry, BufferGeometry, EdgesGeometry, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments, Points, PointsMaterial } from 'three';
import { OPENING_EXHAUST, OPENING_INTAKE, OPENING_VENT, type FlowScene } from './gridScene';

/** Dev-tools view of the solver's grid and how each cell is used, in layout mm like the streaks. */
export interface GridView {
  group: Group;
  dispose: () => void;
}

const SOLID = [1, 0.35, 0.3];
const POROUS = [0.3, 0.6, 1];
const FAN = [0.35, 1, 0.45];
const VENT = [1, 0.9, 0.3];
const INTAKE = [0.3, 1, 1];
const EXHAUST = [1, 0.6, 0.2];
const OPEN = [0.55, 0.55, 0.55];
const OUTSIDE = [0.3, 0.3, 0.3];

/** One point per solid, porous, fan, opening and open cell: open air inside the case is thinned to every fourth cell and the air outside to a sparse subset, so the view stays cheap. */
export function buildGridView(scene: FlowScene): GridView {
  const [nx, ny, nz] = scene.dims;
  const { cellMm, origin, caseMin, caseMax } = scene;
  const positions: number[] = [];
  const colors: number[] = [];
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = i + nx * (j + ny * k);
    const inside = i >= caseMin[0] && i <= caseMax[0] && j >= caseMin[1] && j <= caseMax[1] && k >= caseMin[2] && k <= caseMax[2];
    let color: number[] | null = null;
    if (scene.fanCell[c]) color = FAN;
    else if (scene.opening[c] === OPENING_VENT) color = VENT;
    else if (scene.opening[c] === OPENING_INTAKE) color = INTAKE;
    else if (scene.opening[c] === OPENING_EXHAUST) color = EXHAUST;
    else if (scene.solid[c]) color = SOLID;
    else if (scene.darcy[c] > 0) color = POROUS;
    else if (inside && (i + j + k) % 4 === 0) color = OPEN;
    else if (!inside && (i + j + k) % 12 === 0) color = OUTSIDE;
    if (!color) continue;
    positions.push((i + 0.5) * cellMm - origin[0], (j + 0.5) * cellMm - origin[1], (k + 0.5) * cellMm - origin[2]);
    colors.push(color[0], color[1], color[2]);
  }
  const points = new BufferGeometry();
  points.setAttribute('position', new Float32BufferAttribute(positions, 3));
  points.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const pointMaterial = new PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false });
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
