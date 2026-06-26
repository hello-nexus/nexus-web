import { fetchService, putService } from './service';

export interface LianLiState {
  isConnected: boolean;
  rpm: number[];
  fansPerPort: number[];
}

export function getLianLiState(): Promise<LianLiState | null> {
  return fetchService<LianLiState>('/devices/lianli/state');
}

export function setLianLiFanCount(port: number, count: number): Promise<unknown | null> {
  return putService('/devices/lianli/fan-count', { port, count });
}
