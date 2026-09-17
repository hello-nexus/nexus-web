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

export async function importKlipy(slug: string, crop: string) {
  return postService<{ item: { id: string } | null; error?: boolean; msg?: string }>(
    '/media/klipy/import', { slug, crop });
}

/**
 * Centre crop of a source at `aspect`, normalized 0..1, in the "x,y,w,h" form
 * /media/klipy/import passes to ffmpeg. Without it the canvas pads a square GIF
 * with black bars, which on an LED strip is dead pixels rather than letterbox.
 */
export function centreCrop(width: number, height: number, aspect: number): string {
  if (!(width > 0) || !(height > 0) || !(aspect > 0)) return '0,0,1,1';
  const sourceAspect = width / height;
  if (sourceAspect > aspect) {
    const w = aspect / sourceAspect;
    return `${((1 - w) / 2).toFixed(6)},0,${w.toFixed(6)},1`;
  }
  const h = sourceAspect / aspect;
  return `0,${((1 - h) / 2).toFixed(6)},1,${h.toFixed(6)}`;
}
