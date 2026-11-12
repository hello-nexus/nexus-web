import { describe, expect, it } from 'vitest';
import type { SmartPollDrive } from '../../../api/smartPoll';
import {
  driveIntervalValue, effectiveSeconds, pairPollDrives, setDefaultInterval, setDriveInterval,
  SMART_POLL_FOLLOW_DEFAULT, type SmartPollState,
} from './smartPollHelpers';

const hdd: SmartPollDrive = { id: '/hdd/0', name: 'HDD', seconds: 30, usesDefault: true, rotational: true };
const ssd: SmartPollDrive = { id: '/nvme/0', name: 'SSD', seconds: 1, usesDefault: true, rotational: false };
const base: SmartPollState = { seconds: {}, defaultSeconds: 30, perDrive: false };

describe('smart poll per-drive helpers', () => {
  it('runs every drive at the shared default while drives are not set separately', () => {
    expect(effectiveSeconds(base, ssd)).toBe(30);
    expect(driveIntervalValue(base, ssd)).toBe(SMART_POLL_FOLLOW_DEFAULT);
  });

  it('turns per-drive on and pins the other drives to the shared default', () => {
    const patch = setDriveInterval(base, [hdd, ssd], '/nvme/0', '5');
    expect(patch).toEqual({ smartPollSeconds: { '/hdd/0': 30, '/nvme/0': 5 }, smartPollDefaultSeconds: 30, smartPollPerDrive: true });
  });

  it('turns per-drive off once every drive is back on the default', () => {
    const state: SmartPollState = { seconds: { '/hdd/0': 30, '/nvme/0': 5 }, defaultSeconds: 30, perDrive: true };
    const patch = setDriveInterval(state, [hdd, ssd], '/nvme/0', SMART_POLL_FOLLOW_DEFAULT);
    expect(patch.smartPollPerDrive).toBe(false);
    expect(patch.smartPollSeconds['/nvme/0']).toBe(30);
  });

  it('keeps Never as a per-drive choice', () => {
    expect(setDriveInterval(base, [hdd], '/hdd/0', '0').smartPollSeconds['/hdd/0']).toBe(0);
  });

  it('moves only the drives following the default when the default changes', () => {
    const state: SmartPollState = { seconds: { '/hdd/0': 30, '/nvme/0': 5 }, defaultSeconds: 30, perDrive: true };
    const patch = setDefaultInterval(state, [hdd, ssd], 60);
    expect(patch).toEqual({ smartPollSeconds: { '/hdd/0': 60, '/nvme/0': 5 }, smartPollDefaultSeconds: 60, smartPollPerDrive: true });
  });

  it('only writes the default while no drive is set apart', () => {
    expect(setDefaultInterval(base, [hdd], 60)).toEqual({ smartPollSeconds: {}, smartPollDefaultSeconds: 60, smartPollPerDrive: false });
  });

  it('falls back to the media default for a drive with no entry once per-drive is on', () => {
    const state: SmartPollState = { seconds: { '/hdd/0': 5 }, defaultSeconds: 30, perDrive: true };
    expect(effectiveSeconds(state, ssd)).toBe(1);
  });

  it('pairs by model name one-to-one, ignoring case and spacing', () => {
    const twin: SmartPollDrive = { ...ssd, id: '/nvme/1' };
    const map = pairPollDrives(
      [{ id: 'storage:a', name: ' ssd' }, { id: 'storage:b', name: 'SSD' }, { id: 'storage:c', name: 'Other' }],
      [ssd, twin],
    );
    expect(map.get('storage:a')?.id).toBe('/nvme/0');
    expect(map.get('storage:b')?.id).toBe('/nvme/1');
    expect(map.has('storage:c')).toBe(false);
  });
});
