// Host-side client for an SDK app's generic app-data documents
// (/apps-api/data/{appId}/{key}), plus the topic name the broadcast lands on.
// Only spawnSandboxedWidget calls this - the appId is always the widget's own
// listing id, bound here rather than accepted from the worker.

import { authFetchWithStatus } from '../api/service';
import type { AppDataDoc, AppDataPutResult } from '../../sdk/runtime/context';

/** Anything but a 200 (get) or a 200/409 (put) rejects with this - the SDK
 *  hook's put()/the initial read branch retry behavior on `status` (0 means
 *  a transport failure: offline, or no LAN route off-relay). */
export interface AppDataHttpError extends Error {
  status: number;
}

function httpError(message: string, status: number): AppDataHttpError {
  const err = new Error(message) as AppDataHttpError;
  err.status = status;
  return err;
}

function appDataPath(appId: string, key: string): string {
  return `/apps-api/data/${encodeURIComponent(appId)}/${encodeURIComponent(key)}`;
}

export function appDataTopic(appId: string, key: string): string {
  return `app-data/${appId}/${key}`;
}

/** A document as the service returns it: tagged with the profile it belongs to. */
export type ProfileAppDataDoc = AppDataDoc & { profileId?: string };

export async function getAppData(appId: string, key: string): Promise<ProfileAppDataDoc> {
  const { response, status } = await authFetchWithStatus(appDataPath(appId, key));
  if (!response) throw httpError('app-data get failed: offline', status || 0);
  let body: AppDataDoc | null = null;
  try { body = await response.json(); } catch { body = null; }
  if (status === 200 && body && typeof body.revision === 'number' && typeof body.updatedAt === 'string') {
    return body;
  }
  throw httpError(`app-data get failed: ${status}`, status);
}

/** `profileId` is the profile the caller read its base from; the service refuses (409, no revision) once another is active. */
export async function putAppData(appId: string, key: string, baseRevision: number, data: unknown, profileId?: string): Promise<AppDataPutResult> {
  const { response, status } = await authFetchWithStatus(appDataPath(appId, key), {
    method: 'PUT',
    body: profileId ? { baseRevision, data, profileId } : { baseRevision, data },
  });
  if (!response) throw httpError('app-data put failed: offline', status || 0);
  let body: Partial<AppDataDoc> | null = null;
  try { body = await response.json(); } catch { body = null; }
  if (status === 200 && body && typeof body.revision === 'number' && typeof body.updatedAt === 'string') {
    return { ok: true, revision: body.revision, updatedAt: body.updatedAt };
  }
  if (status === 409 && body && typeof body.revision === 'number' && typeof body.updatedAt === 'string') {
    return { ok: false, revision: body.revision, updatedAt: body.updatedAt, data: body.data };
  }
  throw httpError(`app-data put failed: ${status}`, status);
}
