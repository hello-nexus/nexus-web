// Pure helpers for the `ui-avatar` blessed composite: prop coercion and the
// render-mode decision. Kept free of React/DOM/three so they are unit
// testable without a WebGL context.

export type AvatarRenderMode =
  | { kind: 'preview' }
  | { kind: 'empty' }
  | { kind: 'live'; pack: string };

/**
 * Preview (catalog/simulator) always wins: no network, no WebGL, regardless
 * of whether `pack` is even set. Otherwise an empty/missing pack renders
 * nothing, matching how other blessed composites (ClockFace) skip an absent
 * required input instead of surfacing an error.
 */
export function resolveAvatarRenderMode(preview: boolean, pack: unknown): AvatarRenderMode {
  if (preview) return { kind: 'preview' };
  if (typeof pack !== 'string' || pack.trim().length === 0) return { kind: 'empty' };
  return { kind: 'live', pack };
}

export function toBool(v: unknown): boolean {
  return !!v;
}

/** Clamps to the contract's 0..1 range; a non-finite input reads as 0. */
export function clampEnergy(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/**
 * Splits a "TriggerName#seq" reaction key into the animator trigger name.
 * The seq suffix only exists so an unchanged trigger name re-fires (the
 * caller keys a useEffect off the whole string); this just strips it.
 * Returns null for anything that doesn't match the pinned format.
 */
export function parseReactionTrigger(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const i = raw.lastIndexOf('#');
  if (i <= 0 || i === raw.length - 1) return null;
  const seq = raw.slice(i + 1);
  if (!/^\d+$/.test(seq)) return null;
  return raw.slice(0, i);
}
