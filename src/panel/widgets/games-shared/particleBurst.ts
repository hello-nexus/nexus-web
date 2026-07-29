import type { CSSProperties } from 'react';

export interface BurstParticle {
  readonly id: number;
  readonly style: CSSProperties;
}

/** Alternating tones for a burst's particles, shared by every panel game's capture/clear effect. */
export const BURST_TONES = ['var(--accent)', 'var(--accent-glow)'];

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * A randomized outward-flight style for a capture/clear burst particle: an
 * angle, a distance scaled off the board's cell size, and a duration, exposed
 * as the CSS custom properties a shared `particlePop` keyframe reads
 * (`--particle-dx`, `--particle-dy`, `--particle-tone`). `randomFn` defaults
 * to `Math.random` but is injectable so callers can test the mapping.
 */
export function randomBurstStyle(cellSize: number, tone: string, randomFn: () => number = Math.random): CSSProperties {
  const angle = randomFn() * Math.PI * 2;
  const distance = cellSize * (1.3 + randomFn() * 0.9);
  const duration = 320 + randomFn() * 180;
  return {
    '--particle-dx': `${Math.cos(angle) * distance}px`,
    '--particle-dy': `${Math.sin(angle) * distance}px`,
    '--particle-tone': tone,
    animationDuration: `${duration}ms`,
  } as CSSProperties;
}

/** Appends `burst` to `prev`, keeping only the most recent `cap` particles. */
export function appendCappedBurst(prev: readonly BurstParticle[], burst: readonly BurstParticle[], cap: number): BurstParticle[] {
  return [...prev, ...burst].slice(-cap);
}
