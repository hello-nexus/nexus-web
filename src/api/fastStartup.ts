import { fetchService, postService } from './service';

export interface FastStartupInfo {
  supported: boolean;
  enabled: boolean;
  policyManaged: boolean;
  hibernateAvailable: boolean;
}

export async function fetchFastStartup() {
  return fetchService<FastStartupInfo>('/service/fast-startup');
}

export async function setFastStartup(enabled: boolean) {
  return postService<FastStartupInfo>('/service/fast-startup', { enabled });
}
