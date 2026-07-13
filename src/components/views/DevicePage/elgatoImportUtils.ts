// Pure helpers for ElgatoImportModal, split out for direct testing (see
// mappingUtils.ts for the pattern this follows).
import type { ElgatoUnmappedReason } from '../../../api/streamdeck';

/**
 * Dedupe an Elgato profile name against a physical deck's existing preset
 * names by appending " (2)", " (3)", ... A blank/whitespace-only profile
 * name falls back to `fallback` (already localized by the caller) instead
 * of surfacing an empty preset name.
 */
export function dedupePresetName(base: string, existing: readonly string[], fallback: string): string {
  const trimmed = base.trim() || fallback;
  if (!existing.includes(trimmed)) return trimmed;
  let n = 2;
  while (existing.includes(`${trimmed} (${n})`)) n++;
  return `${trimmed} (${n})`;
}

const REASON_KEYS: Record<ElgatoUnmappedReason, string> = {
  plugin: 'devices.streamdeck.import.reason.plugin',
  unsupported: 'devices.streamdeck.import.reason.unsupported',
  hotkey: 'devices.streamdeck.import.reason.hotkey',
  media: 'devices.streamdeck.import.reason.media',
  multiStep: 'devices.streamdeck.import.reason.multiStep',
  encoder: 'devices.streamdeck.import.reason.encoder',
  pageLimit: 'devices.streamdeck.import.reason.pageLimit',
};

/** i18n key for one unmapped-key reason code (see the service's ElgatoUnmappedReason contract). */
export function unmappedReasonKey(reason: ElgatoUnmappedReason): string {
  return REASON_KEYS[reason];
}
