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
import { fetchServiceBlob, postServiceForm } from './service';

interface UploadDeckImageResponse {
  id: string;
}

/** Upload an already client-resized key-icon image; returns its content-addressed id, or null on failure (including a blocked off-LAN transport). */
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
