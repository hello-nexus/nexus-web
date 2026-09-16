// Parses `hint_range` range annotations out of composed lighting GLSL (the
// service serves `_prelude.frag + "\n" + body`; see fetchShaderSource in
// api/lighting.ts). One source of truth for every tunable uniform's
// min/max/step/default: nexus-service parses the identical line format on
// its side, so neither side hardcodes a per-effect range table.

/** One GLSL uniform's declared range, parsed from a `hint_range` comment. */
export interface ShaderParamSpec {
  name: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  /** True once an actual `uniform ...;` line (not a comment-only override) has been seen for this name. */
  declared: boolean;
}

/** Uniforms the renderer binds through a dedicated write (EffectState fields,
 *  plus u_audioBoost which is gated on live audio); resolveParamUniforms
 *  skips them so they are never written twice per frame. Mirrors
 *  ShaderEffect.BaseParamNames in nexus-service. */
export const BASE_UNIFORM_NAMES: ReadonlySet<string> = new Set([
  'u_speed', 'u_intensity', 'u_hue', 'u_colorize', 'u_saturation', 'u_contrast', 'u_audioBoost',
]);

// Greedy `.*` before the name so it captures the LAST u_ identifier before
// hint_range, matching the service parser (a free-text mention of another
// uniform earlier on the line must not steal the annotation).
const HINT_RANGE_RE =
  /.*\b(u_\w+)\b[^\n]*?\bhint_range\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*(?:,\s*(-?[\d.]+))?\s*\)(?:\s*=\s*(-?[\d.]+))?/;

/**
 * Parses every `hint_range` line in composed GLSL. A later line for the same
 * uniform replaces an earlier one wholesale (min/max/step/default together),
 * so a shader body can narrow a range the prelude declared with a
 * comment-only override line; `declared` stays true once any `uniform` line
 * for that name has been seen, even when a later override line is
 * comment-only.
 */
export function parseShaderParams(frag: string): ShaderParamSpec[] {
  const specs = new Map<string, ShaderParamSpec>();
  for (const line of frag.split('\n')) {
    const m = HINT_RANGE_RE.exec(line);
    if (!m) continue;
    const [, name, minStr, maxStr, stepStr, defaultStr] = m;
    const min = Number(minStr);
    const max = Number(maxStr);
    const step = stepStr !== undefined ? Number(stepStr) : 0.01;
    const defaultValue = defaultStr !== undefined ? Number(defaultStr) : min;
    const declaredHere = /^\s*uniform\b/.test(line);
    const prior = specs.get(name);
    specs.set(name, { name, min, max, step, defaultValue, declared: declaredHere || !!prior?.declared });
  }
  return [...specs.values()];
}

/**
 * Clamps `value` into `spec`'s [min, max], substituting `spec.defaultValue`
 * for a non-finite input first. Passes `value` through unchanged when `spec`
 * is undefined - a uniform with no annotation in this shader.
 */
export function clampToSpec(value: number, spec: ShaderParamSpec | undefined): number {
  if (!spec) return value;
  const v = Number.isFinite(value) ? value : spec.defaultValue;
  return Math.min(spec.max, Math.max(spec.min, v));
}

/**
 * Resolves a per-effect `params` dict into the uniform values the renderer
 * should upload: every non-base DECLARED spec is clamped and default-filled
 * even when `params` omits it (an imported profile predating the param, a
 * stale preset), and anything in `params` with no matching spec passes
 * through unchanged so a shader lacking an annotation still renders.
 */
export function resolveParamUniforms(
  params: Record<string, number> | undefined,
  specByName: ReadonlyMap<string, ShaderParamSpec>,
): Record<string, number> {
  const src = params ?? {};
  const out: Record<string, number> = {};
  for (const spec of specByName.values()) {
    if (BASE_UNIFORM_NAMES.has(spec.name)) continue;
    if (spec.declared) out[spec.name] = clampToSpec(src[spec.name] ?? NaN, spec);
    else if (spec.name in src) out[spec.name] = clampToSpec(src[spec.name], spec);
  }
  for (const key of Object.keys(src)) {
    if (!(key in out) && !specByName.has(key) && !BASE_UNIFORM_NAMES.has(key)) out[key] = src[key];
  }
  return out;
}
