// Pure helpers for the community LED mapping UI: artifact -> preview-dot
// projection and import/export hygiene. Kept free of React/DOM so they are
// unit-testable.

import type { MappingArtifact } from '../../../../api/lighting';

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
