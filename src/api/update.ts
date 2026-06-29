import { fetchService, postService } from './service';

export type UpdateChannel = 'production' | 'beta';
export type UpdateMode = 'notify' | 'download' | 'always';
export type UpdateState = 'idle' | 'checking' | 'downloading' | 'verifying' | 'installing' | 'failed';
export type UpdatePhase = 'idle' | 'downloading' | 'verifying' | 'launching' | 'installing' | 'failed' | 'done';

export interface UpdateStatus {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  updateReady: boolean;
  channel: UpdateChannel;
  updateMode: UpdateMode;
  releaseNotes: string;
  lastCheckedUnix: number;
  lastCheckError: string;
  state: UpdateState;
  justUpdatedTo: string;
  // Unix seconds the latest release was published on GitHub. 0 when unknown.
  publishedAtUnix: number;
}

export interface UpdateProgress {
  active: boolean;
  phase: UpdatePhase;
  percent: number;
  message: string;
  version: string;
  success: boolean;
  error: string;
}

export interface StartUpdateResponse {
  started: boolean;
}

// Multiplex topic the service pushes when the OTA status transitions to
// update-available / update-ready. Subscribers refetch GET /update/status so
// the sidebar banner appears on detection instead of at the next 60s poll.
export const UPDATE_TOPIC = 'update';

export const getUpdateStatus = () =>
  fetchService<UpdateStatus>('/update/status');

export const checkForUpdate = () =>
  postService<UpdateStatus>('/update/check', {});

export const startUpdate = (version?: string, options?: { reopenAfter?: boolean }) =>
  postService<StartUpdateResponse>('/update/start', {
    ...(version ? { version } : {}),
    ...(options?.reopenAfter ? { reopenAfter: true } : {}),
  });

export const getUpdateProgress = () =>
  fetchService<UpdateProgress>('/update/progress');
