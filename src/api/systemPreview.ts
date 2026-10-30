import { authFetchWithStatus, fetchService, putServiceBytes } from './service';

export const SYSTEM_PREVIEW_CHANGED_EVENT = 'nexus-system-preview-changed';
/** The service pings this topic when the machine's case changes; subscribers refetch GET /system/case. */
export const SYSTEM_CASE_TOPIC = 'system/case';

/** image: a PNG to show; unchanged: the sent ETag still matches; none: no preview for the current case; error: the request failed. */
export type SystemPreviewResult =
  | { kind: 'image'; blob: Blob; etag: string | null }
  | { kind: 'unchanged' }
  | { kind: 'none' }
  | { kind: 'error' };

/** The machine's saved case id, or null when none is set or the request failed. */
export async function fetchSystemCaseId(): Promise<string | null> {
  try {
    const res = await fetchService<{ caseId?: string | null }>('/system/case');
    return typeof res?.caseId === 'string' && res.caseId ? res.caseId : null;
  } catch {
    return null;
  }
}

/** The stored PC preview; pass the last ETag to get `unchanged` instead of the bytes again. */
export async function fetchSystemPreview(etag?: string | null): Promise<SystemPreviewResult> {
  try {
    const { response, status } = await authFetchWithStatus('/system/preview', {
      cache: 'no-store',
      ...(etag ? { headers: { 'If-None-Match': etag } } : {}),
    });
    if (status === 304) return { kind: 'unchanged' };
    if (status === 404) return { kind: 'none' };
    if (!response || !response.ok) return { kind: 'error' };
    return { kind: 'image', blob: await response.blob(), etag: response.headers.get('ETag') };
  } catch {
    return { kind: 'error' };
  }
}

export async function putSystemPreview(caseId: string, png: ArrayBuffer): Promise<boolean> {
  const res = await putServiceBytes(`/system/preview?caseId=${encodeURIComponent(caseId)}`, new Uint8Array(png), 'image/png');
  return res !== null;
}

export function notifySystemPreviewChanged(): void {
  window.dispatchEvent(new CustomEvent(SYSTEM_PREVIEW_CHANGED_EVENT));
}
