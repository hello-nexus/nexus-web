// AI Integration (MCP) settings API client. The local service hosts a
// separate loopback-only MCP endpoint that AI agents connect to; this module
// is the dashboard's control surface for it (GET /ai/status, POST
// /ai/config, POST /ai/token/rotate). All three endpoints return the same
// AiStatusResponse envelope so a caller can always apply the response
// straight back onto local state without a follow-up GET.
//
// It also carries the local AI assistant client surface: a managed Ollama
// runtime + model catalog the service downloads and runs in-process, driven
// through /ai/assistant/* (GET status, POST runtime/model mutations, POST
// query) plus the `aiAssistant` multiplex WS topic for live download/pull
// progress.

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

// ── Local AI assistant ──────────────────────────────────────────────────────

export type AssistantRuntimeState =
  | 'notInstalled' | 'downloading' | 'installed' | 'starting' | 'running' | 'error';

export interface AssistantDownloadProgress {
  received: number;
  total: number;
}

export interface AssistantPullProgress {
  model: string;
  /** Raw status phrase from Ollama's pull stream (e.g. "pulling manifest"), not localized. */
  status: string;
  received: number;
  total: number;
}

export interface AssistantInstalledModel {
  id: string;
  sizeBytes: number;
}

export interface AssistantCatalogModel {
  id: string;
  label: string;
  downloadBytes: number;
  /** Free-form RAM guidance string from the service, rendered as-is. */
  ramHint: string;
  recommended: boolean;
}

export type AssistantBusyKind = 'installingRuntime' | 'removingRuntime' | 'pullingModel' | 'removingModel';

export interface AssistantBusy {
  kind: AssistantBusyKind;
  model?: string;
}

export interface AiAssistantStatus {
  runtimeState: AssistantRuntimeState;
  systemOllamaDetected: boolean;
  downloadProgress: AssistantDownloadProgress | null;
  installedModels: AssistantInstalledModel[];
  activeModel: string;
  catalog: AssistantCatalogModel[];
  busy: AssistantBusy | null;
}

/** Live progress frame broadcast on the `aiAssistant` multiplex WS topic. */
export interface AiAssistantProgressFrame {
  runtimeState: AssistantRuntimeState;
  downloadProgress: AssistantDownloadProgress | null;
  pull: AssistantPullProgress | null;
}

export interface AssistantToolRun {
  name: string;
  ok: boolean;
}

export interface AiAssistantQueryResponse {
  answer: string;
  toolsRun: AssistantToolRun[];
}

export const fetchAssistantStatus = () =>
  fetchService<AiAssistantStatus>('/ai/assistant/status');

export const installRuntime = () =>
  postService<AiAssistantStatus>('/ai/assistant/runtime/install', {});

export const removeRuntime = () =>
  postService<AiAssistantStatus>('/ai/assistant/runtime/remove', {});

export const pullModel = (model: string) =>
  postService<AiAssistantStatus>('/ai/assistant/model/pull', { model });

export const removeModel = (model: string) =>
  postService<AiAssistantStatus>('/ai/assistant/model/remove', { model });

export const selectModel = (model: string) =>
  postService<AiAssistantStatus>('/ai/assistant/model/select', { model });

export const runAssistantQuery = (prompt: string) =>
  postService<AiAssistantQueryResponse>('/ai/assistant/query', { prompt });
