// Pure helpers for ElgatoImportModal, split out for direct testing (see
// mappingUtils.ts for the pattern this follows).
import type { ElgatoUnmappedKey, ElgatoUnmappedReason } from '../../../api/streamdeck';

/**
 * Dedupe an Elgato profile name against a physical deck's existing preset
 * names by appending " (2)", " (3)", ... A blank/whitespace-only profile
 * name falls back to `fallback` (already localized by the caller) instead
 * of surfacing an empty preset name. Matches trimmed and case-insensitively,
 * mirroring the server's create-time collision check, so a name that only
 * differs by case still gets suffixed instead of round-tripping into a 409.
 */
export function dedupePresetName(base: string, existing: readonly string[], fallback: string): string {
  const trimmed = base.trim() || fallback;
  const isTaken = (candidate: string) => existing.some(name => name.trim().toLowerCase() === candidate.toLowerCase());
  if (!isTaken(trimmed)) return trimmed;
  let n = 2;
  while (isTaken(`${trimmed} (${n})`)) n++;
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
  monitoringSensor: 'devices.streamdeck.import.reason.monitoringSensor',
  audioPath: 'devices.streamdeck.import.reason.audioPath',
  openAppArgs: 'devices.streamdeck.import.reason.openAppArgs',
  dialPartial: 'devices.streamdeck.import.reason.dialPartial',
};

/**
 * i18n key for one unmapped-key reason code. Falls back to a generic key for
 * any code not in the map, so a reason the service adds later never renders
 * as a blank line (see the service's ElgatoUnmappedReason contract).
 */
export function unmappedReasonKey(reason: string): string {
  return REASON_KEYS[reason as ElgatoUnmappedReason] ?? 'devices.streamdeck.import.reason.unknown';
}

/** Page 0 in the report is the profile's Default dial page, not a numbered page. */
export const DEFAULT_DIAL_PAGE = 0;

/** i18n key + params for an unmapped entry's location line. */
export function unmappedPositionLabel(item: Pick<ElgatoUnmappedKey, 'page' | 'position' | 'dial'>): { key: string; params: Record<string, string | number> } {
  if (item.dial != null) {
    return item.page === DEFAULT_DIAL_PAGE
      ? { key: 'devices.streamdeck.import.unmappedPositionDefaultDial', params: { dial: item.dial } }
      : { key: 'devices.streamdeck.import.unmappedPositionDial', params: { page: item.page, dial: item.dial } };
  }
  return { key: 'devices.streamdeck.import.unmappedPosition', params: { page: item.page, position: item.position } };
}

/** React key unique per report entry: a stacked dial yields several entries with the same page and dial. */
export function unmappedEntryKey(item: Pick<ElgatoUnmappedKey, 'page' | 'position' | 'dial'>, index: number): string {
  return `${item.page}-${item.dial != null ? `dial-${item.dial}` : item.position}-${index}`;
}
