import { authFetchWithStatus, fetchService, resolveHttp, tokenParam } from './service';

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

interface StageReply { stageId: string | null; alpha?: boolean; error?: boolean; msg?: string }

// A refused pick answers 4xx with the reason in the body; null is only a
// transport failure, so the picker can tell "the service is down" from
// "Klipy refused this one".
async function postStage(path: string, slug: string): Promise<StageReply | null> {
  const { response, status } = await authFetchWithStatus(path, { method: 'POST', body: { slug } });
  if (!response || status === 0) return null;
  try {
    return await response.json() as StageReply;
  } catch {
    return { stageId: null, error: true, msg: `HTTP ${status}` };
  }
}

/** Stages the pick for the lighting cropper; commitMedia finishes it like an upload. */
export const stageKlipy = (slug: string) => postStage('/media/klipy/stage', slug);

/** Stages the pick for one device's cropper; commitBackgroundMedia finishes it like an upload. */
export const stageKlipyBackground = (deviceId: string, slug: string) =>
  postStage(`/panel/devices/${encodeURIComponent(deviceId)}/background-media/klipy/stage`, slug);
