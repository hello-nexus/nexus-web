// Thin client for the local service's focus-mode routes. Envelope-free plain
// JSON, like fps/screentime.
import { authFetchWithStatus, deleteService, fetchService, postService } from './service';

/** Trigger ids the service can actually detect. */
export type FocusTrigger = 'manual' | 'game' | 'obs' | 'app';

export interface FocusGame {
  key: string;
  name: string;
  pid: number;
  sinceMs: number;
}

export interface FocusApp {
  id: string;
  name: string;
  processName: string;
}

export interface FocusMode {
  id: string;
  name: string;
  /** Icon key from FOCUS_ICONS, not a path. */
  icon: string;
  /** Built-in modes can be renamed and retuned, never deleted. */
  builtIn: boolean;
  trigger: FocusTrigger;
  /** Apps that activate the mode under the 'app' trigger. */
  apps: FocusApp[];
  holdNotifications: boolean;
  holdBackgroundTraffic: boolean;
  turnPanelDisplaysOff: boolean;
  staticPanelBackgrounds: boolean;
  exitGraceSeconds: number;
}

export interface FocusStatus {
  activeModeId: string | null;
  /** 'auto' | 'manual' | '' while inactive. */
  reason: string;
  activatedUtcMs: number;
  games: FocusGame[];
  /** Precedence order: the first eligible mode wins. */
  modes: FocusMode[];
  availableTriggers: FocusTrigger[];
}

export const getFocus = () => fetchService<FocusStatus>('/api/focus');

/** Activates one mode by id; null turns the active one off. */
export const setFocusActive = (modeId: string | null) =>
  postService<FocusStatus>('/api/focus/active', { modeId });

export const createFocusMode = (body: { name: string; icon: string; trigger: FocusTrigger }) =>
  postService<FocusStatus>('/api/focus/modes', body);

/** `unresolved` lists app names the service could not identify (a 400); null for any other failure. */
export type FocusUpdateResult =
  | { ok: true; status: FocusStatus }
  | { ok: false; unresolved: string[] | null };

const RESOLVE_PREFIX = 'could not resolve:';

/** Status-aware so a refused app pick reads differently from an offline service. */
export async function updateFocusMode(
  id: string,
  patch: Partial<Omit<FocusMode, 'id' | 'builtIn'>>,
): Promise<FocusUpdateResult> {
  const { response, status } = await authFetchWithStatus(
    `/api/focus/modes/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: patch },
  );
  if (response && response.ok) {
    try {
      return { ok: true, status: (await response.json()) as FocusStatus };
    } catch {
      return { ok: false, unresolved: null };
    }
  }
  if (response && status === 400) {
    try {
      const msg = ((await response.json()) as { msg?: string }).msg ?? '';
      if (msg.startsWith(RESOLVE_PREFIX)) {
        const names = msg.slice(RESOLVE_PREFIX.length).split(',').map(n => n.trim()).filter(Boolean);
        if (names.length > 0) return { ok: false, unresolved: names };
      }
    } catch { /* not JSON: a plain failure */ }
  }
  return { ok: false, unresolved: null };
}

export const deleteFocusMode = (id: string) =>
  deleteService<FocusStatus>(`/api/focus/modes/${encodeURIComponent(id)}`);

export const resetFocusModes = () =>
  postService<FocusStatus>('/api/focus/reset', {});

export const reorderFocusModes = (modeIds: string[]) =>
  postService<FocusStatus>('/api/focus/modes/order', { modeIds });
