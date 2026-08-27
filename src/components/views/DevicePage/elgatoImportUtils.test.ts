// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { dedupePresetName, unmappedReasonKey } from './elgatoImportUtils';
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
      'monitoringSensor', 'audioPath',
    ];
    for (const reason of reasons) {
      expect(unmappedReasonKey(reason)).toBe(`devices.streamdeck.import.reason.${reason}`);
    }
  });

  it('falls back to the unknown key for a code the client does not recognize', () => {
    expect(unmappedReasonKey('somethingNew')).toBe('devices.streamdeck.import.reason.unknown');
  });
});
