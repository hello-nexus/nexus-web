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
