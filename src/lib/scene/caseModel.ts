import { Group, Matrix4 } from 'three';
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
