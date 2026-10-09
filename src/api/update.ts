import { fetchService, postService } from './service';

export type UpdateChannel = 'production' | 'beta';
export type UpdateMode = 'notify' | 'download' | 'always';
export type UpdateState = 'idle' | 'checking' | 'downloading' | 'verifying' | 'installing' | 'ready' | 'failed';
export type UpdatePhase = 'idle' | 'downloading' | 'verifying' | 'launching' | 'installing' | 'failed' | 'done';

export interface UpdateStatus {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  updateReady: boolean;
  // False where the service cannot install updates itself (a dev run, an app
  // in a folder it cannot write); the badge and modal open downloadUrl instead.
  canAutoInstall: boolean;
  // False when the release's SHA256SUMS does not list this platform's
  // installer: nothing downloads in the background, so the badge offers the
  // update as soon as it is available. Absent from services that predate it.
  canStage?: boolean;
  // The browser_download_url of this platform's release asset. Populated
  // whenever updateAvailable is true.
  downloadUrl: string;
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

export type ChannelDirection = 'upgrade' | 'downgrade' | 'none';

// What switching to a channel would install. version is empty when the
// channel has no release; error is empty unless the lookup failed.
export interface ChannelTarget {
  channel: UpdateChannel;
  currentVersion: string;
  version: string;
  direction: ChannelDirection;
  canAutoInstall: boolean;
  downloadUrl: string;
  releaseNotes: string;
  error: string;
}

export const getChannelTarget = (channel: UpdateChannel) =>
  fetchService<ChannelTarget>(`/update/channel-target?channel=${channel}`);

export const switchChannel = (channel: UpdateChannel, version: string) =>
  postService<StartUpdateResponse>('/update/switch-channel', { channel, version });
