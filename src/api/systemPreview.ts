import { authFetchWithStatus, fetchService, putServiceBinary } from './service';

export const SYSTEM_PREVIEW_CHANGED_EVENT = 'nexus-system-preview-changed';

/** The machine's saved case id, or null when none is set or the service is unreachable. */
export async function fetchSystemCaseId(): Promise<string | null> {
  const res = await fetchService<{ caseId?: string | null }>('/system/case');
  return typeof res?.caseId === 'string' && res.caseId ? res.caseId : null;
}

/** The stored PC preview PNG; null when the service has none for the current case (404) or fails. */
export async function fetchSystemPreview(): Promise<Blob | null> {
  const { response } = await authFetchWithStatus('/system/preview');
  if (!response || !response.ok) return null;
  return response.blob();
}

export function putSystemPreview(caseId: string, png: ArrayBuffer): Promise<boolean> {
  return putServiceBinary(`/system/preview?caseId=${encodeURIComponent(caseId)}`, png, 'image/png');
}

export function notifySystemPreviewChanged(): void {
  window.dispatchEvent(new CustomEvent(SYSTEM_PREVIEW_CHANGED_EVENT));
}
