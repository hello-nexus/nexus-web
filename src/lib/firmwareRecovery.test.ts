import { describe, expect, it } from 'vitest';
import type { FirmwareStatusItem } from '../hooks/useFirmwareStatus';
import type { FlashStatus } from '../hooks/useFlashStatus';
import { findRecoveryRow, flashMatchesRecovery, recoveryAction, recoveryDone } from './firmwareRecovery';

function row(over: Partial<FirmwareStatusItem> = {}): FirmwareStatusItem {
  return {
    deviceType: 'qseries', firmwareType: 'q60', name: 'HYTE Q60', category: 'cooling',
    currentVersion: '', availableVersion: '1.2.3', updateAvailable: false, availableVersions: [], devImages: [],
    needsRecovery: true, recoveryState: 'ready', ...over,
  };
}

function flash(over: Partial<FlashStatus> = {}): FlashStatus {
  return { active: false, deviceType: 'q60', version: '1.2.3', phase: 'done', percent: 100, message: '', success: true, error: '', ...over };
}

describe('recoveryAction', () => {
  it('offers Recover for an identified device with a bundled image', () => {
    expect(recoveryAction(row(), false)).toBe('recover');
  });

  it('only checks while the service is identifying the device', () => {
    expect(recoveryAction(row({ recoveryState: 'identifying', firmwareType: '', availableVersion: '' }), true)).toBe('checking');
  });

  it('sends an unsupported device to support in a release build', () => {
    const r = row({ recoveryState: 'unsupported', firmwareType: '', availableVersion: '', devImages: [{ firmwareType: 'q60', version: '1.2.3' }] });
    expect(recoveryAction(r, false)).toBe('contactSupport');
  });

  it('lets a dev-tools build pick an image for an unsupported device', () => {
    const r = row({ recoveryState: 'unsupported', firmwareType: '', availableVersion: '', devImages: [{ firmwareType: 'q60', version: '1.2.3' }] });
    expect(recoveryAction(r, true)).toBe('pick');
  });

  it('does not offer Recover when ready but the image version is missing', () => {
    expect(recoveryAction(row({ availableVersion: '' }), false)).toBe('contactSupport');
  });
});

describe('findRecoveryRow', () => {
  it('returns the recovery row and ignores normal rows', () => {
    const normal = row({ needsRecovery: false, recoveryState: '' });
    expect(findRecoveryRow([normal, row()])).toEqual(row());
    expect(findRecoveryRow([normal])).toBeNull();
    expect(findRecoveryRow([row({ needsRecovery: undefined })])).toBeNull();
  });
});

describe('flash matching', () => {
  it('matches the identified catalog key or any dev image', () => {
    expect(flashMatchesRecovery(row(), flash())).toBe(true);
    expect(flashMatchesRecovery(row(), flash({ deviceType: 'np50' }))).toBe(false);
    const unknown = row({ firmwareType: '', devImages: [{ firmwareType: 'np50', version: '2.0.0' }] });
    expect(flashMatchesRecovery(unknown, flash({ deviceType: 'np50' }))).toBe(true);
  });

  it('never matches an empty status device type against an unknown row', () => {
    expect(flashMatchesRecovery(row({ firmwareType: '' }), flash({ deviceType: '' }))).toBe(false);
    expect(flashMatchesRecovery(row(), null)).toBe(false);
  });

  it('reports done only for a finished successful matching flash', () => {
    expect(recoveryDone(row(), flash())).toBe(true);
    expect(recoveryDone(row(), flash({ success: false, phase: 'failed' }))).toBe(false);
    expect(recoveryDone(row(), flash({ active: true, phase: 'downloading' }))).toBe(false);
  });
});
