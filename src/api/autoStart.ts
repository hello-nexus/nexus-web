import { fetchService, postService } from './service';

export interface AutoStartResponse {
  autoStart: boolean;
}

// Windows SCM-backed startup mode; no-op on macOS/Linux (no SCM).
export async function fetchAutoStart() {
  return fetchService<AutoStartResponse>('/service/startup-mode');
}

export async function setAutoStart(autoStart: boolean) {
  return postService<AutoStartResponse>('/service/startup-mode', { autoStart });
}
