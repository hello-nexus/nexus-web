import { fetchService, putService } from './service';

export interface Galahad2LcdRingEffectSpec {
  id: string;
  /** How many colors the animation reads; 0 means it ignores them. */
  colors: number;
}

export interface Galahad2LcdRingEffect {
  isConnected: boolean;
  effect: string;
  speed: number;
  brightness: number;
  colors: string[];
  /** True while Nexus lighting drives the ring, which overrides the animation. */
  nexusDriven: boolean;
  effects: Galahad2LcdRingEffectSpec[];
}

export interface Galahad2LcdRingEffectPatch {
  effect: string;
  speed: number;
  brightness: number;
  colors: string[];
}

export function getGalahad2LcdRingEffect(): Promise<Galahad2LcdRingEffect | null> {
  return fetchService<Galahad2LcdRingEffect>('/devices/lianli-galahad2-lcd/ring-effect');
}

export function setGalahad2LcdRingEffect(patch: Galahad2LcdRingEffectPatch): Promise<unknown | null> {
  return putService('/devices/lianli-galahad2-lcd/ring-effect', patch);
}
