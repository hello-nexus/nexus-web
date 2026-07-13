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
  open: 'devices.streamdeck.import.reason.open',
  website: 'devices.streamdeck.import.reason.website',
  text: 'devices.streamdeck.import.reason.text',
  media: 'devices.streamdeck.import.reason.media',
  multiStep: 'devices.streamdeck.import.reason.multiStep',
  encoder: 'devices.streamdeck.import.reason.encoder',
  pageLimit: 'devices.streamdeck.import.reason.pageLimit',
  hotkeyExtraSlots: 'devices.streamdeck.import.reason.hotkeyExtraSlots',
  textEnterIgnored: 'devices.streamdeck.import.reason.textEnterIgnored',
};

/**
 * i18n key for one unmapped-key reason code. Falls back to a generic key for
 * any code not in the map, so a reason the service adds later never renders
 * as a blank line (see the service's ElgatoUnmappedReason contract).
 */
export function unmappedReasonKey(reason: string): string {
  return REASON_KEYS[reason as ElgatoUnmappedReason] ?? 'devices.streamdeck.import.reason.unknown';
}
