import { fetchService } from './service';

export interface LianLiTlFan {
  port: number;
  fanIndex: number;
  rpm: number;
  duty: number;
}

export interface LianLiTlState {
  isConnected: boolean;
  fans: LianLiTlFan[];
}

export function getLianLiTlState(): Promise<LianLiTlState | null> {
  return fetchService<LianLiTlState>('/devices/lianli-tl/state');
}
