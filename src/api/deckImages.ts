// Client for the deck custom-icon image store (nexus-service's
// DeckImageStore). Unlike src/api/streamdeck.ts these routes are panel-
// reachable (AllowPanel), not LocalhostOnly - both the touch widget (any
// panel surface) and the physical deck editor (desktop only) can carry a
// custom key image.
import { fetchServiceBlob, postServiceForm } from './service';

interface UploadDeckImageResponse {
  id: string;
}

/** Upload an already client-resized key-icon image; returns its content-addressed id, or null on failure. */
export async function uploadDeckImage(blob: Blob): Promise<string | null> {
  const form = new FormData();
  form.append('file', blob, 'icon.png');
  const res = await postServiceForm<UploadDeckImageResponse>('/deck/images', form);
  return res?.id ?? null;
}

/** Fetch a previously uploaded key-icon image's bytes, or null on failure. */
export function fetchDeckImage(id: string): Promise<Blob | null> {
  return fetchServiceBlob(`/deck/images/${encodeURIComponent(id)}`);
}
