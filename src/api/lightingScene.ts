import { fetchService, putService } from './service';

import type { SceneBinding, SceneCamera, SceneModel, SceneObject } from '../lib/scene/sceneTypes';

export type { SceneAnchor, SceneBinding, SceneCamera, SceneModel, SceneObject, SceneTarget, Vec3 } from '../lib/scene/sceneTypes';

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
  /** The exported objects' shapes; null keeps none. */
  model?: SceneModel | null;
}

export const fetchLightingScene = () => fetchService<LightingScene>('/lighting/scene');

export const putLightingScene = (scene: { objects: SceneObject[]; bindings: SceneBinding[] }) =>
  putService<LightingScene>('/lighting/scene', scene);

export const importLightingScene = (body: SceneImport) => putService<LightingScene>('/lighting/scene/import', body);


/**
 * Commits the view; `draft` drives the hardware without saving, for a camera mid-drag. `seq` increases with every
 * request from one editor `session`, so the service drops a draft that lands after its commit. Answers the saved view.
 */
export const putSceneView = (body: { enabled?: boolean; camera?: SceneCamera; draft?: boolean; session?: string; seq?: number }) =>
  putService<SceneView>('/lighting/scene/view', body);

export const fetchSceneModel = () => fetchService<SceneModel>('/lighting/scene/model');
