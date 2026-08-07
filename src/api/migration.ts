import { fetchService, postService } from './service';

export interface Nexus2StatusResponse {
  detected: boolean;
  importAvailable: boolean;
  deviceEligible: boolean;
  version?: string | null;
  autostartTaskPresent: boolean;
  pending: boolean;
}

export interface Nexus2DismissResponse {
  dismissed: boolean;
}

// nexus-service's ApiResponse envelope: Ok() serializes { error: false, msg }, Fail() { error: true, msg }.
export interface Nexus2DisableAutostartResponse {
  error: boolean;
  msg: string;
}

export async function fetchNexus2Status() {
  return fetchService<Nexus2StatusResponse>('/migration/nexus2');
}

export async function dismissNexus2Welcome() {
  return postService<Nexus2DismissResponse>('/migration/nexus2/dismiss', {});
}

export async function disableNexus2Autostart() {
  return postService<Nexus2DisableAutostartResponse>('/migration/nexus2/disable-autostart', {});
}
