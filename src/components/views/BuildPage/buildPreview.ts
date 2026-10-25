import { notifySystemPreviewChanged, putSystemPreview } from '../../../api/systemPreview';

const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;

/**
 * Stores the PC preview PNG the Build frame rendered (`nexus-build:set-preview`)
 * and tells the dashboard widget to refetch. Resolves whether it landed.
 */
export async function relayPreviewSave(caseId: string, png: unknown): Promise<boolean> {
  if (!(png instanceof ArrayBuffer) || png.byteLength === 0 || png.byteLength > MAX_PREVIEW_BYTES) return false;
  const saved = await putSystemPreview(caseId, png);
  if (saved) notifySystemPreviewChanged();
  return saved;
}
