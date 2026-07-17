// AI Integration (MCP) settings API client. The local service hosts a
// separate loopback-only MCP endpoint that AI agents connect to; this module
// is the dashboard's control surface for it (GET /ai/status, POST
// /ai/config, POST /ai/token/rotate). All three endpoints return the same
// AiStatusResponse envelope so a caller can always apply the response
// straight back onto local state without a follow-up GET.

import { fetchService, postService } from './service';

export interface AiCapabilities {
  telemetry: boolean;
  cooling: boolean;
  lighting: boolean;
  profiles: boolean;
  history: boolean;
}

export interface AiStatusResponse {
  enabled: boolean;
  running: boolean;
  port: number;
  endpoint: string;
  /** Empty until a token has been minted (first enable). */
  token: string;
  lastError: string | null;
  capabilities: AiCapabilities;
}

export interface AiConfigPatch {
  enabled?: boolean;
  capabilities?: Partial<AiCapabilities>;
}

export const fetchAiStatus = () =>
  fetchService<AiStatusResponse>('/ai/status');

export const postAiConfig = (patch: AiConfigPatch) =>
  postService<AiStatusResponse>('/ai/config', patch);

export const rotateAiToken = () =>
  postService<AiStatusResponse>('/ai/token/rotate', {});
