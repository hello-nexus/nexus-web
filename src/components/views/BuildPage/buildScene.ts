import { fetchLightingDevices } from '../../../api/lighting';
import { importLightingScene, putLightingScene, putSceneView, fetchLightingScene, type LightingScene, type SceneModel, type SceneObject, type Vec3 } from '../../../api/lightingScene';
import { autoPlace } from '../../../lib/scene/autoPlace';
import { presetCamera } from '../../../lib/scene/scenePresets';

// The service enforces the real bounds; this only keeps a bad frame message from being sent.
const MAX_OBJECTS = 64;

/**
 * Sends a PC scene the Build frame exported (`nexus-build:set-scene`) to this
 * machine's service, then places every device whose spot is certain (a keyboard
 * on the one keyboard), so its lights follow the scene at once. A first import
 * also gives the view a camera framing the PC. Resolves whether it landed.
 */
export async function relaySceneExport(data: Record<string, unknown>): Promise<boolean> {
  const objects = data.objects;
  if (!Array.isArray(objects) || objects.length === 0 || objects.length > MAX_OBJECTS) return false;
  const caseId = typeof data.caseId === 'string' ? data.caseId : null;
  const model = data.model && typeof data.model === 'object' && !Array.isArray(data.model) ? data.model as SceneModel : null;
  const saved = await importLightingScene({ caseId, objects: objects as SceneObject[], model });
  if (!saved) return false;
  const devices = await fetchLightingDevices().catch(() => null);
  if (devices) {
    const sure = autoPlace(saved.objects, saved.bindings, devices.devices);
    if (sure.placed.length > 0) await putLightingScene({ objects: saved.objects, bindings: sure.bindings });
  }
  if (!saved.view.camera) {
    const scene = (await fetchLightingScene()) ?? saved;
    await putSceneView({ enabled: true, camera: presetCamera(scene.objects, 'angle') });
  }
  return true;
}

/** Where each object from Build stands in this machine's scene, for the frame to draw and edit the same desk. */
export function scenePlacements(scene: Pick<LightingScene, 'objects'> | null): Record<string, { position: Vec3; yaw: number }> {
  const out: Record<string, { position: Vec3; yaw: number }> = {};
  for (const o of scene?.objects ?? []) if (o.source === 'build') out[o.id] = { position: o.position, yaw: o.yaw };
  return out;
}
