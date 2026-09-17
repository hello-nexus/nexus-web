import { fetchService, postService, resolveHttp, tokenParam } from './service';

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

/** Stages the pick for the lighting cropper; commitMedia finishes it like an upload. */
export async function stageKlipy(slug: string) {
  return postService<{ stageId: string | null; error?: boolean; msg?: string }>(
    '/media/klipy/stage', { slug });
}

/** Stages the pick for one device's cropper; commitBackgroundMedia finishes it like an upload. */
export async function stageKlipyBackground(deviceId: string, slug: string) {
  return postService<{ stageId: string | null; alpha: boolean; error?: boolean; msg?: string }>(
    `/panel/devices/${encodeURIComponent(deviceId)}/background-media/klipy/stage`, { slug });
}
