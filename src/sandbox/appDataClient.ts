// Host-side client for an SDK app's generic app-data documents
// (/apps-api/data/{appId}/{key}), plus the topic name the broadcast lands on.
// Only spawnSandboxedWidget calls this - the appId is always the widget's own
// listing id, bound here rather than accepted from the worker.

import { authFetchWithStatus, fetchService } from '../api/service';
import type { AppDataDoc, AppDataPutResult } from '../../sdk/runtime/context';

function appDataPath(appId: string, key: string): string {
  return `/apps-api/data/${encodeURIComponent(appId)}/${encodeURIComponent(key)}`;
}

export function appDataTopic(appId: string, key: string): string {
  return `app-data/${appId}/${key}`;
}

export async function getAppData(appId: string, key: string): Promise<AppDataDoc> {
  const res = await fetchService<AppDataDoc>(appDataPath(appId, key));
  if (!res) throw new Error('app-data get failed');
  return res;
}

export async function putAppData(appId: string, key: string, baseRevision: number, data: unknown): Promise<AppDataPutResult> {
  const { response, status } = await authFetchWithStatus(appDataPath(appId, key), {
    method: 'PUT',
    body: { baseRevision, data },
  });
  if (!response) throw new Error('app-data put failed');
  let body: Partial<AppDataDoc> | null = null;
  try { body = await response.json(); } catch { body = null; }
  if (status === 200 && body && typeof body.revision === 'number' && typeof body.updatedAt === 'string') {
    return { ok: true, revision: body.revision, updatedAt: body.updatedAt };
  }
  if (status === 409 && body && typeof body.revision === 'number' && typeof body.updatedAt === 'string') {
    return { ok: false, revision: body.revision, updatedAt: body.updatedAt, data: body.data };
  }
  throw new Error(`app-data put failed: ${status}`);
}
