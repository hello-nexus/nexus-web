import { fetchService, postService } from './service';

export type UpdateChannel = 'production' | 'beta';
export type UpdateState = 'idle' | 'checking' | 'downloading' | 'verifying' | 'installing' | 'failed';
export type UpdatePhase = 'idle' | 'downloading' | 'verifying' | 'launching' | 'installing' | 'failed' | 'done';

export interface UpdateStatus {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  updateReady: boolean;
  channel: UpdateChannel;
  autoUpdateDisabled: boolean;
  releaseNotes: string;
  lastCheckedUnix: number;
  lastCheckError: string;
  state: UpdateState;
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

export const startUpdate = (version?: string) =>
  postService<StartUpdateResponse>('/update/start', version ? { version } : {});

export const getUpdateProgress = () =>
  fetchService<UpdateProgress>('/update/progress');
