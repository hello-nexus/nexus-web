import { BufferGeometry, DoubleSide, EdgesGeometry, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, Shape, ShapeGeometry, Path, BoxGeometry, Vector2, type Color } from 'three';
import type { CaseBox, Vec3 } from '../caseLayout';
import type { Obstacle } from './obstacles';
import { hullWall } from './hull';

/** The geometry of one obstacle as the grid rasterizes it: a plate in its plane, a closed solid by its faces, anything else as its box turned by `rotationY`. Layout mm. */
export function obstacleGeometry(box: CaseBox): { geometry: BufferGeometry; position: Vec3; rotationY: number } {
  const center: Vec3 = [box.min[0] + box.size[0] / 2, box.min[1] + box.size[1] / 2, box.min[2] + box.size[2] / 2];
  if (box.plate) {
    const n = box.plate.normal;
    const [a, b] = [0, 1, 2].filter(i => i !== n);
    const shape = new Shape(box.plate.outline.map(([u, v]) => new Vector2(u, v)));
    for (const h of box.plate.holes) shape.holes.push(new Path(h.map(([u, v]) => new Vector2(u, v))));
    const flat = new ShapeGeometry(shape);
    const pos = flat.getAttribute('position');
    const out = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const q = [0, 0, 0];
      q[a] = pos.getX(i);
      q[b] = pos.getY(i);
      q[n] = box.min[n] + box.size[n] / 2;
      out[i * 3] = q[0]; out[i * 3 + 1] = q[1]; out[i * 3 + 2] = q[2];
    }
    flat.dispose();
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(out, 3));
    geometry.setIndex(flat.getIndex() ? Array.from(flat.getIndex()!.array as ArrayLike<number>) : null);
    return { geometry, position: [0, 0, 0], rotationY: 0 };
  }
  if (box.faces) {
    const pts: number[] = [];
    for (const face of box.faces) for (let i = 1; i < face.length - 1; i++) pts.push(...face[0], ...face[i], ...face[i + 1]);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(pts, 3));
    return { geometry, position: [0, 0, 0], rotationY: 0 };
  }
  return { geometry: new BoxGeometry(box.size[0], box.size[1], box.size[2]), position: center, rotationY: box.rotationY ?? 0 };
}

/** Translucent shapes for a scene's obstacles, solid ones in `solid` and porous ones in `porous`. A hull cut shows only its wall, since the rest of the cut lies outside the case. Dispose with the returned function. */
export function buildCollisionShapes(obstacles: readonly Obstacle[], solid: Color, porous: Color): { group: Group; dispose: () => void } {
  const group = new Group();
  const owned: { dispose: () => void }[] = [];
  for (const o of obstacles) {
    const { geometry, position, rotationY } = obstacleGeometry(o.kind === 'hull' ? hullWall(o.box) : o.box);
    const color = o.porous ? porous : solid;
    const face = new MeshBasicMaterial({ color, transparent: true, opacity: o.porous ? 0.2 : 0.28, side: DoubleSide, depthWrite: false });
    const mesh = new Mesh(geometry, face);
    mesh.position.set(...position);
    mesh.rotation.y = rotationY;
    mesh.userData.obstacle = o;
    const edges = new EdgesGeometry(geometry, 25);
    const edgeMaterial = new LineBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false });
    mesh.add(new LineSegments(edges, edgeMaterial));
    group.add(mesh);
    owned.push(geometry, face, edges, edgeMaterial);
  }
  return { group, dispose: () => owned.forEach(d => d.dispose()) };
}
