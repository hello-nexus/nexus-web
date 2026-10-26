import { Color, DoubleSide, EdgesGeometry, LessEqualDepth, Group, LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshBasicMaterial, type Material } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** The case model Build exports (binary glTF), parsed. One loader for the lighting scene and the cooling view. */
export async function parseCaseModel(bytes: ArrayBuffer): Promise<Group> {
  return (await new GLTFLoader().parseAsync(bytes, '')).scene;
}

/**
 * Build bakes layout space to scene space into the model: x' = sx * (z - W/2), y' = y, z' = D/2 - x, with sx -1 for a right-window case
 * (nexus-build sceneExport.ts and sceneAnchors.ts layoutToScene). This is the inverse, taking the model back to layout space (mm, x front to rear, y up, z from the window side).
 */
export function sceneToLayoutMatrix(size: readonly [number, number, number], windowRight: boolean): Matrix4 {
  const [D, W] = size;
  const sx = windowRight ? -1 : 1;
  return new Matrix4().set(0, 0, -1, D / 2, 0, 1, 0, 0, sx, 0, 0, W / 2, 0, 0, 0, 1);
}

/** Scales every structure line (case, desk, objects, free spots) so the LEDs and airflow read first; selected and hovered lines ignore it. */
export const STRUCTURE_LINE_DIM = 0.45;

/** Face and edge opacities of the styled case model, the values Build's own case view draws at (no structure dimming). */
export const CASE_FACE_OPACITY = 0.1;
export const CASE_LINE_OPACITY = 0.45;

/** Replaces the model's materials with a faint face and an edge outline, so what is inside stays visible. Returns what to dispose. */
export function styleCaseModel(model: Group, face: Color, line: Color): { dispose: () => void } {
  const owned: { dispose: () => void }[] = [];
  const meshes: Mesh[] = [];
  model.traverse(o => { if ((o as Mesh).isMesh) meshes.push(o as Mesh); });
  for (const mesh of meshes) {
    for (const old of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) old.dispose();
    // Depth only, drawn before any tint: the nearest surface owns each pixel, so stacked shells tint once and the edges behind a surface stay hidden, as in Build.
    const depthMaterial = new MeshBasicMaterial({ colorWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    mesh.add(new Mesh(mesh.geometry, depthMaterial));
    const material: Material = new MeshBasicMaterial({
      color: face, transparent: true, opacity: CASE_FACE_OPACITY, side: DoubleSide, depthWrite: false, depthFunc: LessEqualDepth,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    });
    mesh.material = material;
    const edgesGeometry = new EdgesGeometry(mesh.geometry, 25);
    const edgeMaterial = new LineBasicMaterial({ color: line, transparent: true, opacity: CASE_LINE_OPACITY, depthWrite: false });
    mesh.add(new LineSegments(edgesGeometry, edgeMaterial));
    owned.push(material, depthMaterial, edgesGeometry, edgeMaterial);
  }
  return {
    dispose: () => {
      for (const o of owned) o.dispose();
      for (const mesh of meshes) mesh.geometry.dispose();
    },
  };
}
