import { fetchService, putService } from './service';

/** One attached Nollie controller as GET /devices/nollie lists it. */
export interface NollieBoard {
  id: string;
  name: string;
  serial: string;
  channels: number;
  ports: number;
  /** The firmware takes a standalone colour at all (original and legacy boards; OS2 boards do not). */
  supportsStandalone: boolean;
  /** The firmware also offers its built-in effect as the standalone mode. */
  supportsBuiltInEffect: boolean;
  standaloneMode: NollieStandaloneMode;
  /** "#RRGGBB" */
  standaloneColor: string;
}

export type NollieStandaloneMode = 'static' | 'builtin';

export interface NollieStandalonePatch {
  mode?: NollieStandaloneMode;
  color?: string;
}

export function getNollieBoards(): Promise<NollieBoard[] | null> {
  return fetchService<{ boards: NollieBoard[] }>('/devices/nollie').then(r => r?.boards ?? null);
}

export function setNollieStandalone(id: string, patch: NollieStandalonePatch): Promise<unknown | null> {
  return putService(`/devices/nollie/${encodeURIComponent(id)}/standalone`, patch);
}
