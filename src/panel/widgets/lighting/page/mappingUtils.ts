// Pure helpers for the community LED mapping UI: group range packing,
// artifact -> preview-dot projection, and save-body construction. Kept free
// of React/DOM so they are unit-testable.

import type { LedGroup, LedGroupRange, LedMapEntry, MappingArtifact } from '../../../../api/lighting';

/**
 * Collapse a set of LED indices into sorted, inclusive, contiguous ranges.
 * Duplicates are ignored; [0,1,2,5] becomes [{0..2},{5..5}].
 */
export function collapseToRanges(indices: Iterable<number>): LedGroupRange[] {
  const sorted = Array.from(new Set(indices)).sort((a, b) => a - b);
  const ranges: LedGroupRange[] = [];
  for (const idx of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && idx === last.end + 1) {
      last.end = idx;
    } else {
      ranges.push({ start: idx, end: idx });
    }
  }
  return ranges;
}

/** Expand inclusive ranges back into a sorted, de-duplicated index list. */
export function expandRanges(ranges: LedGroupRange[]): number[] {
  const out = new Set<number>();
  for (const r of ranges) {
    if (r.end < r.start) continue;
    for (let i = r.start; i <= r.end; i++) out.add(i);
  }
  return Array.from(out).sort((a, b) => a - b);
}

export interface PreviewDot {
  i: number;
  /** Normalized position, clamped to the unit square. */
  u: number;
  v: number;
  disabled: boolean;
}

/**
 * Project the first zone of an artifact into preview dots. The per-item
 * preview is the community's main garbage filter, so malformed entries are
 * clamped rather than dropped - a broken layout should LOOK broken.
 */
export function artifactPreviewDots(artifact: MappingArtifact | null | undefined): PreviewDot[] {
  const zone = artifact?.zones?.[0];
  if (!zone || !Array.isArray(zone.leds)) return [];
  const disabledSet = new Set(zone.disabled ?? []);
  const dots: PreviewDot[] = [];
  for (const led of zone.leds) {
    if (typeof led?.i !== 'number') continue;
    dots.push({
      i: led.i,
      u: clamp01(led.u),
      v: clamp01(led.v),
      disabled: disabledSet.has(led.i),
    });
  }
  return dots;
}

function clamp01(n: unknown): number {
  if (typeof n !== 'number' || Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Dot radius (preview viewBox units) that keeps dense matrices legible. */
export function previewDotRadius(count: number): number {
  if (count > 150) return 1.1;
  if (count > 60) return 1.7;
  return 2.4;
}

/**
 * Minimal structural check before POSTing an imported artifact; the service
 * runs the strict schema validation.
 */
export function looksLikeMappingArtifact(value: unknown): value is MappingArtifact {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.schemaVersion === 'number'
    && typeof obj.name === 'string'
    && Array.isArray(obj.zones);
}

/** Strip filesystem-hostile characters from a download file name. */
export function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '-').trim();
  return cleaned.length > 0 ? cleaned : 'layout';
}

// Tolerance below which two normalized coordinates count as the same spot.
const SAME_POSITION_EPSILON = 0.0001;
// Tolerance below which two aspect ratios count as unchanged.
const SAME_RATIO_EPSILON = 0.0001;

export interface LedMapSaveOverride {
  ledIndex: number;
  u: number;
  v: number;
  disabled?: boolean;
}

export interface LedMapSaveBody {
  overrides: LedMapSaveOverride[];
  /** Zero when the user did not adjust the ratio this session; the service ignores zero and keeps whatever is stored. */
  aspectRatio: number;
  /** Present only when the user edited groups this session; omitting the field leaves the stored user groups untouched. */
  groups?: LedGroup[];
}

/**
 * Build the led-map save body without baking an applied community mapping
 * into the user delta. `isCustom` is the user-ownership marker: the service
 * sets it only on stored user overrides and every editor mutation sets it
 * locally, so entries without it (mapping-positioned or mapping-disabled
 * LEDs) must not be re-posted as user data.
 */
export function buildLedMapSaveBody(args: {
  leds: LedMapEntry[];
  defaults: LedMapEntry[];
  /** Current editor aspect ratio. */
  rectRatio: number;
  /** Ratio as it arrived on load, which may originate from an applied mapping. */
  loadedRatio: number;
  groups: LedGroup[];
  /** True when the user created, renamed, or deleted a group this session. */
  groupsEdited: boolean;
}): LedMapSaveBody {
  const overrides: LedMapSaveOverride[] = [];
  for (const led of args.leds) {
    if (!led.isCustom) continue;
    const def = args.defaults.find(d => d.index === led.index);
    const posUnchanged = def
      && Math.abs(led.u - def.u) < SAME_POSITION_EPSILON
      && Math.abs(led.v - def.v) < SAME_POSITION_EPSILON;
    // An enabled override sitting at its default position is a no-op for the
    // user map; a user-disabled LED must still round-trip so the parked
    // state survives a reload.
    if (posUnchanged && !led.disabled) continue;
    overrides.push({
      ledIndex: led.index,
      u: led.u,
      v: led.v,
      ...(led.disabled ? { disabled: true } : {}),
    });
  }
  // Re-posting the loaded ratio would convert a mapping-supplied ratio into
  // a user delta, so only send the live value once it diverges from the
  // loaded one (i.e. the user adjusted it this session).
  const ratioChanged = Math.abs(args.rectRatio - args.loadedRatio) > SAME_RATIO_EPSILON;
  return {
    overrides,
    aspectRatio: ratioChanged ? args.rectRatio : 0,
    ...(args.groupsEdited ? { groups: args.groups } : {}),
  };
}
