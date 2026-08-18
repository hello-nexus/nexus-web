import {
  BASE_DEFAULTS,
  TEMPLATE_COUNT,
  defaultParamsFor,
  type EffectState,
  type EffectTemplateBundle,
} from './lighting';

/**
 * Template merge/compare helpers for the animate preset system.
 *
 * The canonical default bundles (signature looks, per-slot param variations,
 * simple-fill slots) live in nexus-service and are fetched once per session
 * via fetchAnimateDefaults (api/lighting.ts); the client bundles no copy.
 * /lighting/animate/settings carries only user deltas - a null or absent slot
 * means "the default" - so every helper here takes the fetched defaults and
 * merges over them.
 *
 * baselineTemplates is the degraded fallback for when the defaults are not
 * available (service unreachable, or a pre-defaults-endpoint service): the
 * effect's base state in all four slots, so the UI stays functional and
 * corrects itself once a fetch succeeds.
 */

/** Fallback bundle when the canonical defaults are unavailable: the effect's
 *  base state (rainbow feel, stock params) in all four slots. */
export function baselineTemplates(effectKey: string): EffectTemplateBundle {
  const params = defaultParamsFor(effectKey);
  const slots: EffectState[] = Array.from({ length: TEMPLATE_COUNT }, () => ({
    ...BASE_DEFAULTS,
    params: { ...params },
  }));
  return { selected: 0, slots };
}

/** The canonical default bundle for an effect, or the baseline fallback when
 *  the fetched defaults are missing (not yet loaded / old service). Always
 *  returns a full TEMPLATE_COUNT row - a short or sparse defaults bundle is
 *  padded from its own base slot (the simple fills ship a single slot), so
 *  callers can index slots unconditionally and a padded slot still carries
 *  the effect's real look. */
export function defaultTemplatesFor(
  effectKey: string,
  defaults: Record<string, EffectTemplateBundle> | null | undefined,
): EffectTemplateBundle {
  const bundle = defaults?.[effectKey];
  if (!bundle || !bundle.slots || bundle.slots.length === 0) return baselineTemplates(effectKey);
  const fallback = bundle.slots[0];
  const slots: EffectState[] = Array.from({ length: TEMPLATE_COUNT }, (_, i) => {
    const s = bundle.slots[i] ?? fallback;
    return { ...s, params: { ...s.params } };
  });
  return { selected: bundle.selected ?? 0, slots };
}

/**
 * Merge the server's sparse user deltas into the canonical defaults. Any slot
 * the server provides wins; null or missing slots are back-filled from the
 * defaults so we always present the user with a full row of 4 usable presets.
 */
export function mergeTemplates(
  effectKey: string,
  server: EffectTemplateBundle | undefined,
  defaults: Record<string, EffectTemplateBundle> | null | undefined,
): EffectTemplateBundle {
  const built = defaultTemplatesFor(effectKey, defaults);
  if (!server) return built;
  const serverSlots = server.slots ?? [];
  const slots: EffectState[] = [];
  for (let i = 0; i < TEMPLATE_COUNT; i++) {
    const s = serverSlots[i];
    if (s) {
      slots.push({
        ...built.slots[i],
        ...s,
        params: { ...built.slots[i].params, ...(s.params ?? {}) },
      });
    } else {
      slots.push(built.slots[i]);
    }
  }
  const selected = Math.min(Math.max(server.selected ?? 0, 0), TEMPLATE_COUNT - 1);
  return { selected, slots };
}

/**
 * True when the given slot matches its canonical default within float
 * round-trip tolerance. Drives the Reset button's enabled state. Also true
 * when the defaults are unavailable: "default" is then unknowable, and a
 * disabled Reset is the safe wrong answer - an enabled one would commit and
 * persist a baseline look in place of the curated default.
 */
export function slotMatchesDefault(
  effectKey: string,
  slotIndex: number,
  slot: EffectState,
  defaults: Record<string, EffectTemplateBundle> | null | undefined,
): boolean {
  const def = defaults?.[effectKey]?.slots[slotIndex];
  if (!def) return true;
  const eps = 1e-4;
  if (Math.abs(slot.speed - def.speed) > eps) return false;
  if (Math.abs(slot.intensity - def.intensity) > eps) return false;
  if (Math.abs(slot.hue - def.hue) > eps) return false;
  if (Math.abs(slot.colorize - def.colorize) > eps) return false;
  if (Math.abs(slot.saturation - def.saturation) > eps) return false;
  if (Math.abs(slot.contrast - def.contrast) > eps) return false;
  const keysA = Object.keys(slot.params);
  const keysB = Object.keys(def.params);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (!(k in def.params)) return false;
    if (Math.abs(slot.params[k] - def.params[k]) > eps) return false;
  }
  return true;
}

/** Upper bound on colorize selectable via the PaletteRing. Full range so
 *  the user can collapse the arc all the way to a single point (pure mono)
 *  or expand it to the full rainbow. Default SIGNATURE values for mono
 *  slots still ship at 0.75 so there's visible variation out of the box,
 *  but the UI doesn't clamp further edits. */
export const MAX_COLORIZE = 1.0;

/**
 * Short stable signature of a slot's render-affecting fields. The service renders
 * a thumbnail from the saved selected slot, so this becomes the per-effect
 * cache-bust token (see effectThumbnailPath): it changes exactly when the saved
 * look changes, which is what triggers a thumbnail refetch. Floats are rounded so
 * round-trip noise doesn't churn the token.
 */
export function slotThumbSignature(slot: EffectState): string {
  const r = (n: number) => Math.round(n * 1000);
  const parts: (string | number)[] = [
    r(slot.speed), r(slot.intensity), r(slot.hue),
    r(slot.colorize), r(slot.saturation), r(slot.contrast),
  ];
  for (const k of Object.keys(slot.params).sort()) parts.push(k, r(slot.params[k]));
  // FNV-1a 32-bit over the joined fields, emitted base36.
  let h = 0x811c9dc5;
  const str = parts.join(',');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export { BASE_DEFAULTS };
