import type { BufferGeometry, Material, Mesh, Object3D } from 'three';

/** The parts of a scene graph that decide how it looks: transforms, draw order, geometry and material parameters. For tests that compare two call sites of the same scene. */
export interface SceneSignature {
  type: string;
  position: number[];
  rotation: number[];
  scale: number[];
  renderOrder: number;
  visible: boolean;
  geometry?: { type: string; vertices: number; indices: number; checksum: number };
  material?: Record<string, unknown>;
  children: SceneSignature[];
}

const round = (n: number) => Math.round(n * 1000) / 1000;

function geometryOf(g: BufferGeometry) {
  const position = g.getAttribute('position');
  let checksum = 0;
  if (position) for (let i = 0; i < position.array.length; i++) checksum += position.array[i] * ((i % 7) + 1);
  return { type: g.type, vertices: position?.count ?? 0, indices: g.index?.count ?? 0, checksum: round(checksum) };
}

const MATERIAL_KEYS = ['opacity', 'transparent', 'depthWrite', 'depthTest', 'depthFunc', 'colorWrite', 'side', 'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits', 'linewidth', 'dashed', 'dashSize', 'gapSize'] as const;

function materialOf(m: Material) {
  const out: Record<string, unknown> = { type: m.type };
  const bag = m as unknown as Record<string, unknown>;
  for (const key of MATERIAL_KEYS) if (key in bag) out[key] = bag[key];
  const color = bag.color as { getHexString?: () => string } | undefined;
  if (color?.getHexString) out.color = color.getHexString();
  return out;
}

export function sceneSignature(object: Object3D): SceneSignature {
  const mesh = object as Mesh;
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  return {
    type: object.type,
    position: object.position.toArray().map(round),
    rotation: [object.rotation.x, object.rotation.y, object.rotation.z].map(round),
    scale: object.scale.toArray().map(round),
    renderOrder: object.renderOrder,
    visible: object.visible,
    ...(mesh.geometry ? { geometry: geometryOf(mesh.geometry) } : {}),
    ...(material ? { material: materialOf(material) } : {}),
    children: object.children.map(sceneSignature),
  };
}
