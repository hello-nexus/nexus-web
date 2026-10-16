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

// A refusal (policy-managed, hibernation off) returns an error envelope or null, not the DTO.
export async function setFastStartup(enabled: boolean) {
  return postService<FastStartupInfo & { error?: boolean; msg?: string }>('/service/fast-startup', { enabled });
}
