import { fetchService, postService } from './service';

export interface ObsConfigResponse {
  error: boolean;
  msg: string;
  host: string;
  port: number;
  hasPassword: boolean;
}

export interface ObsConfigBody {
  host?: string;
  port?: number;
  password?: string;
}

export interface ObsScene {
  name: string;
  uuid: string;
}

export interface ObsStatusResponse {
  error: boolean;
  msg: string;
  connected: boolean;
  host: string;
  port: number;
  activeScene: string;
  scenes: ObsScene[];
  recording: boolean;
  streaming: boolean;
  recordingDurationMs: number;
  streamingDurationMs: number;
}

export const fetchObsConfig = () =>
  fetchService<ObsConfigResponse>('/api/obs/config');

export const saveObsConfig = (body: ObsConfigBody) =>
  postService('/api/obs/config', body);

export const fetchObsStatus = () =>
  fetchService<ObsStatusResponse>('/api/obs/status');

export const connectObs = () =>
  postService<ObsStatusResponse>('/api/obs/connect', {});

export const toggleObsRecording = () =>
  postService<ObsStatusResponse>('/api/obs/recording/toggle', {});

export const toggleObsStreaming = () =>
  postService<ObsStatusResponse>('/api/obs/streaming/toggle', {});

export const setObsScene = (sceneName: string) =>
  postService<ObsStatusResponse>('/api/obs/scene', { sceneName });

export const launchObs = () =>
  postService('/api/obs/launch', {});
