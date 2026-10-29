import { fetchService, postService } from './service';

export type AstralPinState = 'ok' | 'caution' | 'warning' | 'overcurrent' | 'critical' | 'dead';

export interface AstralCard {
  /** Same id as the GPU's sensor parent id. */
  gpuId: string;
  name: string;
  level: { available: boolean; calibrating: boolean; calibratedAtMs?: number };
  pins: { amps: number; state: AstralPinState }[];
  /** The worst pin. */
  state: AstralPinState;
}

export interface AstralSettings {
  alerts: boolean;
  equalizer: boolean;
  overcurrentShutdown: boolean;
  overcurrentSeconds: number;
  countdownSeconds: number;
  criticalShutdown: boolean;
}

export interface AstralState {
  supported: boolean;
  cards: AstralCard[];
  settings: AstralSettings;
  /** Absent, not null, when nothing is counting down. */
  countdown?: {
    reason: 'overcurrent' | 'critical';
    endsAtMs: number;
    /** Milliseconds left when the service built this state, never negative; immune to client clock skew. */
    remainingMs: number;
    /** The card whose countdown it is. */
    gpuId: string;
  };
  /** The user canceled an overcurrent countdown; critical still arms and cannot be canceled. */
  heldOff: boolean;
  simulated: boolean;
}

export const fetchAstral = () => fetchService<AstralState>('/astral');

export const saveAstralSettings = (patch: Partial<AstralSettings>) =>
  postService<AstralState>('/astral/settings', patch);

export const calibrateAstral = (gpuId: string) => postService<AstralState>('/astral/calibrate', { gpuId });

export const cancelAstralShutdown = () => postService<AstralState>('/astral/shutdown/cancel', {});

export const shutdownAstralNow = () => postService<AstralState>('/astral/shutdown/now', {});
