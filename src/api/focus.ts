// Thin client for the local service's focus-mode routes. Envelope-free plain
// JSON, like fps/screentime.
import { deleteService, fetchService, patchService, postService } from './service';

/** Trigger ids the service can actually detect. */
export type FocusTrigger = 'manual' | 'game' | 'obs';

export interface FocusGame {
  key: string;
  name: string;
  pid: number;
  sinceMs: number;
}

export interface FocusMode {
  id: string;
  name: string;
  /** Icon key from FOCUS_ICONS, not a path. */
  icon: string;
  /** Built-in modes can be renamed and retuned, never deleted. */
  builtIn: boolean;
  autoActivate: boolean;
  trigger: FocusTrigger;
  holdNotifications: boolean;
  holdBackgroundTraffic: boolean;
  turnPanelDisplaysOff: boolean;
  exitGraceSeconds: number;
}

export interface FocusStatus {
  enabled: boolean;
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

export const setFocusEnabled = (enabled: boolean) =>
  postService<FocusStatus>('/api/focus/enabled', { enabled });

export const createFocusMode = (body: { name: string; icon: string; trigger: FocusTrigger }) =>
  postService<FocusStatus>('/api/focus/modes', body);

export const updateFocusMode = (id: string, patch: Partial<Omit<FocusMode, 'id' | 'builtIn'>>) =>
  patchService<FocusStatus>(`/api/focus/modes/${encodeURIComponent(id)}`, patch);

export const deleteFocusMode = (id: string) =>
  deleteService<FocusStatus>(`/api/focus/modes/${encodeURIComponent(id)}`);

export const reorderFocusModes = (modeIds: string[]) =>
  postService<FocusStatus>('/api/focus/modes/order', { modeIds });
