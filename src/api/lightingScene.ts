import { deleteService, fetchService, fetchServiceBlob, putService } from './service';

/** Scene millimetres: +Y up, desk at y = 0, +Z toward the seated user. Mirrors nexus-service Lighting/Scene/SceneModels.cs. */
export type Vec3 = [number, number, number];

export interface SceneAnchor {
  id: string;
  /** fan, radiator, gpu, ram, board, pump, psu, strip, panel or surface. */
  kind: string;
  label?: string | null;
  /** Object-local centre. */
  center: Vec3;
  /** Object-local unit vector along the LED map's u. */
  right: Vec3;
  /** Object-local unit vector toward the LED map's top edge. */
  up: Vec3;
  width: number;
  height: number;
  shape: 'ring' | 'rect';
}

export interface SceneObject {
  id: string;
  kind: string;
  label?: string | null;
  source: 'user' | 'build';
  position: Vec3;
  /** Degrees, counter-clockwise seen from above. */
  yaw: number;
  size: Vec3;
  hasModel?: boolean;
  anchors: SceneAnchor[];
}

export interface SceneTarget {
  objectId: string;
  anchorId: string;
}

export interface SceneBinding {
  deviceId: string;
  targets: SceneTarget[];
  /** Clockwise quarter turns of the LED map on its surface, in degrees. */
  rotation: number;
  flip: boolean;
}

export interface SceneCamera {
  position: Vec3;
  target: Vec3;
  /** Vertical field of view, degrees. */
  fov: number;
}

export interface SceneView {
  enabled: boolean;
  camera?: SceneCamera | null;
}

export interface LightingScene {
  objects: SceneObject[];
  bindings: SceneBinding[];
  view: SceneView;
  modelRev?: string | null;
  caseId?: string | null;
}

export interface SceneImport {
  caseId?: string | null;
  objects: SceneObject[];
  /** Binary glTF, base64. */
  modelBase64?: string | null;
}

export const fetchLightingScene = () => fetchService<LightingScene>('/lighting/scene');

export const putLightingScene = (scene: { objects: SceneObject[]; bindings: SceneBinding[] }) =>
  putService<LightingScene>('/lighting/scene', scene);

export const importLightingScene = (body: SceneImport) => putService<LightingScene>('/lighting/scene/import', body);

export const deleteSceneImport = () => deleteService<LightingScene>('/lighting/scene/import');

/**
 * Commits the view; `draft` drives the hardware without saving, for a camera mid-drag. `seq` increases with every
 * request from one editor `session`, so the service drops a draft that lands after its commit. Answers the saved view.
 */
export const putSceneView = (body: { enabled?: boolean; camera?: SceneCamera; draft?: boolean; session?: string; seq?: number }) =>
  putService<SceneView>('/lighting/scene/view', body);

export async function fetchSceneModel(): Promise<ArrayBuffer | null> {
  const blob = await fetchServiceBlob('/lighting/scene/model');
  return blob ? blob.arrayBuffer() : null;
}
