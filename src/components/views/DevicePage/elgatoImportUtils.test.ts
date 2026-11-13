// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { dedupePresetName, unmappedEntryKey, unmappedPositionLabel, unmappedReasonKey } from './elgatoImportUtils';
import type { ElgatoUnmappedReason } from '../../../api/streamdeck';

describe('dedupePresetName', () => {
  it('returns the base name unchanged when nothing conflicts', () => {
    expect(dedupePresetName('Default Profile', [], 'Preset')).toBe('Default Profile');
    expect(dedupePresetName('Default Profile', ['Other'], 'Preset')).toBe('Default Profile');
  });

  it('appends " (2)" on a first conflict', () => {
    expect(dedupePresetName('Default Profile', ['Default Profile'], 'Preset')).toBe('Default Profile (2)');
  });

  it('keeps incrementing past existing numbered conflicts', () => {
    expect(dedupePresetName('Default Profile', ['Default Profile', 'Default Profile (2)'], 'Preset')).toBe('Default Profile (3)');
  });

  it('falls back to the given name for a blank/whitespace-only profile name', () => {
    expect(dedupePresetName('   ', [], 'Preset')).toBe('Preset');
    expect(dedupePresetName('', ['Preset'], 'Preset')).toBe('Preset (2)');
  });

  it('trims surrounding whitespace off the base name', () => {
    expect(dedupePresetName('  Streaming  ', [], 'Preset')).toBe('Streaming');
  });

  it('treats a case-only collision as taken and suffixes it, keeping the original casing', () => {
    expect(dedupePresetName('gaming', ['Gaming'], 'Preset')).toBe('gaming (2)');
  });

  it('keeps incrementing past existing numbered conflicts that only differ by case', () => {
    expect(dedupePresetName('Gaming', ['gaming', 'GAMING (2)'], 'Preset')).toBe('Gaming (3)');
  });
});

describe('unmappedReasonKey', () => {
  it('maps every reason code to its devices.streamdeck.import.reason.* key', () => {
    const reasons: ElgatoUnmappedReason[] = [
      'plugin', 'unsupported', 'hotkey', 'open', 'website', 'text', 'media',
      'multiStep', 'encoder', 'pageLimit', 'hotkeyExtraSlots', 'textEnterIgnored',
      'monitoringSensor', 'audioPath', 'openAppArgs', 'dialPartial',
    ];
    for (const reason of reasons) {
      expect(unmappedReasonKey(reason)).toBe(`devices.streamdeck.import.reason.${reason}`);
    }
  });

  it('falls back to the unknown key for a code the client does not recognize', () => {
    expect(unmappedReasonKey('somethingNew')).toBe('devices.streamdeck.import.reason.unknown');
  });
});

describe('new reason codes and entry labels', () => {
  it('maps openAppArgs and dialPartial to their own keys', () => {
    expect(unmappedReasonKey('openAppArgs')).toBe('devices.streamdeck.import.reason.openAppArgs');
    expect(unmappedReasonKey('dialPartial')).toBe('devices.streamdeck.import.reason.dialPartial');
  });

  it('labels page 0 dials as default dials, not page 0', () => {
    expect(unmappedPositionLabel({ page: 0, position: '', dial: 2 })).toEqual({
      key: 'devices.streamdeck.import.unmappedPositionDefaultDial', params: { dial: 2 },
    });
    expect(unmappedPositionLabel({ page: 1, position: '', dial: 2 }).key).toBe('devices.streamdeck.import.unmappedPositionDial');
    expect(unmappedPositionLabel({ page: 1, position: '2,1' }).key).toBe('devices.streamdeck.import.unmappedPosition');
  });

  it('keys stacked entries on the same dial uniquely', () => {
    const entries = [
      { page: 1, position: '', dial: 2 },
      { page: 1, position: '', dial: 2 },
      { page: 1, position: '2,1' },
      { page: 1, position: '2,1' },
    ];
    const keys = entries.map((e, i) => unmappedEntryKey(e, i));
    expect(new Set(keys).size).toBe(entries.length);
  });
});
