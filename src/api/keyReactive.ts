// Type reactive API wrapper - per-key keyboard lighting that reacts to key presses.

import { fetchService, postService, putService } from './service';

export type KeyReactionEffect =
  | 'fade' | 'rowSweep' | 'columnSweep' | 'ripple' | 'crosshair'
  | 'starburst' | 'heatmap' | 'sparks' | 'lightning' | 'trace';
export type KeyReactionColorMode = 'custom' | 'rainbow' | 'random';
export type KeyReactionBackground = 'effect' | 'dim' | 'dark' | 'reveal';

export interface KeyReaction {
  enabled: boolean;
  effect: KeyReactionEffect;
  colorMode: KeyReactionColorMode;
  /** '#rrggbb' */
  color: string;
  /** Time multiplier. */
  speed: number;
  /** Reach multiplier. */
  size: number;
  background: KeyReactionBackground;
}

export const DEFAULT_KEY_REACTION: KeyReaction = {
  enabled: false,
  effect: 'ripple',
  colorMode: 'custom',
  color: '#ff2d55',
  speed: 1,
  size: 1,
  background: 'effect',
};

export interface KeyReactiveDevice {
  /** Lighting card id; the press, preview and PUT routes take it. */
  id: string;
  /** Physical device the config is stored under; cards of one device share it. */
  deviceId: string;
  /** The card's device index byte in the lighting output frame stream. */
  frameIndex: number;
  /** The device reports its own key presses and ignores OS keystrokes. */
  hardwareKeys: boolean;
  ledCount: number;
  namedKeys: number;
  config: KeyReaction;
}

export interface KeyReactiveState {
  /** A real key source is live (the user-session helper is connected). */
  inputAvailable: boolean;
  devices: KeyReactiveDevice[];
}

export interface KeyReactionPreview {
  /** LED centres in key units from the board's top-left. */
  x: number[];
  y: number[];
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  /** Base64 of frameCount frames, each ledCount * 3 RGB bytes. */
  frames: string;
}

export interface KeyPressBody {
  key?: string | null;
  led?: number | null;
}

const path = (id: string) => `/lighting/key-reactive/${encodeURIComponent(id)}`;

export function fetchKeyReactive(): Promise<KeyReactiveState | null> {
  return fetchService<KeyReactiveState>('/lighting/key-reactive');
}

export function putKeyReaction(id: string, config: KeyReaction): Promise<KeyReaction | null> {
  return putService<KeyReaction>(path(id), config);
}

export function pressKeyReaction(id: string, body: KeyPressBody): Promise<{ ok: boolean } | null> {
  return postService<{ ok: boolean }>(`${path(id)}/press`, body);
}

export function fetchKeyReactionPreview(
  id: string,
  config: KeyReaction,
  signal?: AbortSignal,
): Promise<KeyReactionPreview | null> {
  return postService<KeyReactionPreview>(`${path(id)}/preview`, config, signal);
}
