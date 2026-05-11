import { fetchService, postService } from './service';

export type ProcessElevationStatus = 'elevated' | 'not-elevated' | 'unsupported' | 'unknown';

export interface ProcessElevationResponse {
  platform: 'windows' | 'macos' | 'linux' | '';
  supported: boolean;
  isElevated: boolean;
  status: ProcessElevationStatus;
}

export type ProcessElevationRelaunchResult =
  | 'started'
  | 'already-elevated'
  | 'unsupported'
  | 'user-denied'
  | 'failed';

export interface ProcessElevationRelaunchResponse {
  result: ProcessElevationRelaunchResult;
}

export const fetchProcessElevation = () =>
  fetchService<ProcessElevationResponse>('/system/elevation');

export const requestProcessElevationRelaunch = () =>
  postService<ProcessElevationRelaunchResponse>('/system/elevation/relaunch', {});
