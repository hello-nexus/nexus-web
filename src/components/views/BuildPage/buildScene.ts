import { importLightingScene, putSceneView, fetchLightingScene, type SceneModel, type SceneObject } from '../../../api/lightingScene';
import { presetCamera } from '../../../lib/scene/scenePresets';

// The service enforces the real bounds; this only keeps a bad frame message from being sent.
const MAX_OBJECTS = 64;

/**
 * Sends a PC scene the Build frame exported (`nexus-build:set-scene`) to this
 * machine's service. A first import also turns the 3D view on with a camera
 * framing the PC, so the Lighting page opens on it. Resolves whether it landed.
 */
export async function relaySceneExport(data: Record<string, unknown>): Promise<boolean> {
  const objects = data.objects;
  if (!Array.isArray(objects) || objects.length === 0 || objects.length > MAX_OBJECTS) return false;
  const caseId = typeof data.caseId === 'string' ? data.caseId : null;
  const model = data.model && typeof data.model === 'object' && !Array.isArray(data.model) ? data.model as SceneModel : null;
  const saved = await importLightingScene({ caseId, objects: objects as SceneObject[], model });
  if (!saved) return false;
  if (!saved.view.camera) {
    const scene = (await fetchLightingScene()) ?? saved;
    await putSceneView({ enabled: true, camera: presetCamera(scene.objects, 'angle') });
  }
  return true;
}
