// Process-detail action endpoints - typed wrappers over the local service's
// POST /monitoring/process-kill and POST /monitoring/process-open-location,
// both { name } -> { error, msg }. Same envelope every postService caller
// uses; unlike the read endpoints in this domain these are one-shot actions
// with no dev-mock fallback (there is nothing useful to fake killing).

import { postService } from './service';

export interface ProcessActionResponse {
  error: boolean;
  msg: string;
}

export function killMonitoringProcess(name: string): Promise<ProcessActionResponse | null> {
  return postService<ProcessActionResponse>('/monitoring/process-kill', { name });
}

export function openMonitoringProcessLocation(name: string): Promise<ProcessActionResponse | null> {
  return postService<ProcessActionResponse>('/monitoring/process-open-location', { name });
}
