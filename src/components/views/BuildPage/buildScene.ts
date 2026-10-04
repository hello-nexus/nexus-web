import { importLightingScene, putSceneView, fetchLightingScene, type SceneObject } from '../../../api/lightingScene';
import { presetCamera } from '../../../lib/scene/scenePresets';

// The service enforces the real bounds; these only keep a bad frame message from being encoded and sent.
const MAX_OBJECTS = 64;
const MAX_MODEL_BYTES = 16 * 1024 * 1024;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Sends a PC scene the Build frame exported (`nexus-build:set-scene`) to this
 * machine's service. A first import also turns the 3D view on with a camera
 * framing the PC, so the Lighting page opens on it. Resolves whether it landed.
 */
export async function relaySceneExport(data: Record<string, unknown>): Promise<boolean> {
  const objects = data.objects;
  if (!Array.isArray(objects) || objects.length === 0 || objects.length > MAX_OBJECTS) return false;
  const caseId = typeof data.caseId === 'string' ? data.caseId : null;
  let modelBase64: string | null = null;
  if (data.model instanceof ArrayBuffer) {
    if (data.model.byteLength > MAX_MODEL_BYTES) return false;
    modelBase64 = toBase64(new Uint8Array(data.model));
  }
  const saved = await importLightingScene({ caseId, objects: objects as SceneObject[], modelBase64 });
  if (!saved) return false;
  if (!saved.view.camera) {
    const scene = (await fetchLightingScene()) ?? saved;
    await putSceneView({ enabled: true, camera: presetCamera(scene.objects, 'angle') });
  }
  return true;
}
