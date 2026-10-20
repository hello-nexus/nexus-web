// Client for the deck custom-icon image store (nexus-service's
// DeckImageStore). Unlike src/api/streamdeck.ts these routes are panel-
// reachable (AllowPanel), not LocalhostOnly - both the touch widget (any
// panel surface) and the physical deck editor (desktop only) can carry a
// custom key image. The two directions are not symmetric though: the GET
// goes through authFetch, which tunnels over the cloud relay/LAN-sealed
// transport when off-LAN, but the upload is a multipart POST
// (postServiceForm), which fails closed over those tunnels (same caveat as
// transfer.ts) - a phone panel reached off-LAN can view a custom icon but
// cannot upload a new one.
import { authFetchWithStatus, fetchServiceBlob, postServiceForm, postServiceFormResult } from './service';

interface UploadDeckImageResponse {
  id: string;
}

/** Upload a client-resized still key icon; returns its content-addressed id, or null on failure (including a blocked off-LAN transport). */
export async function uploadDeckImage(blob: Blob, fileName = 'icon.png'): Promise<string | null> {
  const form = new FormData();
  form.append('file', blob, fileName);
  const res = await postServiceForm<UploadDeckImageResponse>('/deck/images', form);
  return res?.id ?? null;
}

export type DeckImageFailure = 'tooLarge' | 'expired' | 'busy' | 'failed';
export type DeckImageResult = { id: string } | { failure: DeckImageFailure };

/** Maps a service refusal to the failure the picker words: 404 is an expired stage, 503 a transient busy, "too large" a result over the cap. */
export function deckImageFailureOf(refusal: { msg: string; status?: number }): DeckImageFailure {
  if (refusal.status === 404) return 'expired';
  if (refusal.status === 503) return 'busy';
  if (refusal.status === 413 || /too large/i.test(refusal.msg)) return 'tooLarge';
  return 'failed';
}

async function postDeckImage(path: string, form: FormData): Promise<DeckImageResult> {
  const res = await postServiceFormResult<UploadDeckImageResponse & { error: boolean; msg: string }>(path, form);
  if (!res) return { failure: 'failed' };
  if (res.error || !('id' in res) || !res.id) return { failure: deckImageFailureOf(res as { msg: string; status?: number }) };
  return { id: res.id };
}

/** Upload an untouched GIF/MP4/WebM file with the user's serialized square crop; the service crops and scales it. */
export function uploadDeckAnimated(file: File, crop: string): Promise<DeckImageResult> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('crop', crop);
  return postDeckImage('/deck/images', form);
}

/** Commits a staged Klipy pick as a deck key icon with the user's serialized square crop (JSON, so it also works over the relay). */
export async function commitDeckKlipyStage(stageId: string, crop: string): Promise<DeckImageResult> {
  const { response, status } = await authFetchWithStatus(
    `/deck/images/stage/${encodeURIComponent(stageId)}`,
    { method: 'POST', body: { crop } },
  );
  if (!response || status === 0) return { failure: 'failed' };
  let body: { id?: string; msg?: string } | null = null;
  try {
    body = await response.json();
  } catch {
    // Not JSON: the status carries what there is.
  }
  if (response.ok && body?.id) return { id: body.id };
  return { failure: deckImageFailureOf({ msg: body?.msg ?? '', status }) };
}

/** Fetch a previously uploaded key-icon image's bytes, or null on failure. */
export function fetchDeckImage(id: string): Promise<Blob | null> {
  return fetchServiceBlob(`/deck/images/${encodeURIComponent(id)}`, { mayBeCached: true });
}
