// Community FPS estimate DTOs for the cloud /fps/signature and /fps/table
// routes (nexus-api's fps module). See src/api/nexusApi.ts for the client.

export interface FpsSignatureParams {
  gpu?: string;
  cpu?: string;
  mobo?: string;
  ramBytes?: number;
  res: string;
  hz?: number;
}

export interface FpsSignatureResolved {
  gpu: string | null;
  cpu: string | null;
  mobo: string | null;
  ramTier: number | null;
  resClass: string;
  hz: number | null;
  levels: number[];
}

export interface FpsSignatureResponse {
  sigKey: string;
  resolved: FpsSignatureResolved;
}

export type FpsEstimateConfidence = 'low' | 'medium' | 'high';

export interface FpsTableGameItem {
  gameKey: string;
  title: string;
  steamAppId: number | null;
  level: number;
  avg: number;
  p1: number;
  p50: number;
  p99: number;
  min: number;
  max: number;
  sessions: number;
  installs: number;
  confidence: FpsEstimateConfidence;
  lowerBound: boolean;
  /** Neighbour GPU model id a level-7 row was scaled from; opaque, never a display name. */
  basis?: string;
  /** resClass the estimate actually came from, when it differs from the requested one. */
  resBasis?: string;
}

export interface FpsTableResponse {
  normVersion: number;
  sigKey: string;
  generatedAt: string;
  games: FpsTableGameItem[];
}
