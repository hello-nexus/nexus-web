import { fetchService, postService, resolveHttp, tokenParam } from './service';
import type { BackgroundMediaItem } from './panelBackgroundMedia';

export interface KlipyGif {
  slug: string;
  title: string;
  /** Dimensions of the file an import bakes, used to compute the centre crop. */
  width: number;
  height: number;
  blurPreview?: string;
}

export interface KlipySearchResult {
  items: KlipyGif[];
  hasNext: boolean;
  error?: boolean;
  msg?: string;
}

/** Empty query returns the trending page. */
export const searchKlipy = (query: string, page: number) =>
  fetchService<KlipySearchResult>(
    `/api/klipy/search?q=${encodeURIComponent(query)}&page=${page}`);

/** Proxied through the service: a panel has no route to Klipy's CDN. */
export function klipyThumbUrl(slug: string): string {
  const base = resolveHttp(`/api/klipy/thumb/${encodeURIComponent(slug)}`);
  const tok = tokenParam();
  return tok ? `${base}?${tok}` : base;
}

export async function importKlipy(slug: string, crop: string) {
  return postService<{ item: { id: string } | null; error?: boolean; msg?: string }>(
    '/media/klipy/import', { slug, crop });
}

/** The same pick, baked as one device's panel background at its panel size. */
export async function importKlipyBackground(
  deviceId: string, slug: string, crop: string, w: number, h: number, keepTransparency = false,
) {
  return postService<{ item: BackgroundMediaItem | null; error?: boolean; msg?: string }>(
    `/panel/devices/${encodeURIComponent(deviceId)}/background-media/klipy/import`,
    { slug, crop, w, h, keepTransparency });
}
