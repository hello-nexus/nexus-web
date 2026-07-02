import { describe, expect, it } from 'vitest';
import { isProfileSyncSettled } from './syncProfileRows';
import type { SyncProfileStatus } from '../../../../api/cloud';

const PROFILE: SyncProfileStatus = {
  profileId: 'p1',
  name: 'Default',
  lastSyncedAt: '2026-07-01T10:00:00.000Z',
  revision: 3,
};

describe('isProfileSyncSettled', () => {
  it('is settled once the global state leaves syncing', () => {
    expect(isProfileSyncSettled('idle', '2026-07-01T09:00:00.000Z', [PROFILE], 'p1')).toBe(true);
    expect(isProfileSyncSettled('dirty', '2026-07-01T09:00:00.000Z', [PROFILE], 'p1')).toBe(true);
    expect(isProfileSyncSettled('error', '2026-07-01T09:00:00.000Z', [PROFILE], 'p1')).toBe(true);
    expect(isProfileSyncSettled('offline', '2026-07-01T09:00:00.000Z', [PROFILE], 'p1')).toBe(true);
  });

  it('is not settled while syncing and the row has not advanced', () => {
    expect(isProfileSyncSettled('syncing', PROFILE.lastSyncedAt, [PROFILE], 'p1')).toBe(false);
  });

  it('is settled while syncing if the row lastSyncedAt already advanced past the baseline', () => {
    expect(isProfileSyncSettled('syncing', '2026-07-01T09:00:00.000Z', [PROFILE], 'p1')).toBe(true);
  });

  it('is not settled while syncing if the profile row is missing from the list', () => {
    expect(isProfileSyncSettled('syncing', '2026-07-01T09:00:00.000Z', [], 'p1')).toBe(false);
  });

  it('treats a never-synced baseline of "" correctly once the row gets a real timestamp', () => {
    const neverSynced: SyncProfileStatus = { ...PROFILE, lastSyncedAt: '2026-07-01T11:00:00.000Z' };
    expect(isProfileSyncSettled('syncing', '', [neverSynced], 'p1')).toBe(true);
    expect(isProfileSyncSettled('syncing', '', [{ ...neverSynced, lastSyncedAt: '' }], 'p1')).toBe(false);
  });
});
