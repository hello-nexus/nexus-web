import { afterEach, describe, expect, it } from 'vitest';
import { clearSeedFailures, recordSeedFailure, SEED_RETRY_MS, seedAttemptKey, seedFailedRecently } from './seedAttempts';

describe('seed attempts', () => {
  afterEach(() => clearSeedFailures());

  it('holds a failed attempt off for a day, then allows another', () => {
    const key = seedAttemptKey('case-1', 'setup-a');
    expect(seedFailedRecently(key, 1000)).toBe(false);
    recordSeedFailure(key, 1000);
    expect(seedFailedRecently(key, 1000 + SEED_RETRY_MS - 1)).toBe(true);
    expect(seedFailedRecently(key, 1000 + SEED_RETRY_MS)).toBe(false);
  });

  it('treats a changed setup or another case as a new attempt', () => {
    recordSeedFailure(seedAttemptKey('case-1', 'setup-a'), 1000);
    expect(seedFailedRecently(seedAttemptKey('case-1', 'setup-b'), 1001)).toBe(false);
    expect(seedFailedRecently(seedAttemptKey('case-2', 'setup-a'), 1001)).toBe(false);
  });

  it('forgets failures older than a day when it records another', () => {
    recordSeedFailure('old', 0);
    recordSeedFailure('new', SEED_RETRY_MS + 5);
    expect(JSON.parse(localStorage.getItem('nexus.buildSeed.failed') ?? '{}')).toEqual({ new: SEED_RETRY_MS + 5 });
  });

  it('survives unusable stored data', () => {
    localStorage.setItem('nexus.buildSeed.failed', '{not json');
    expect(seedFailedRecently('x')).toBe(false);
    recordSeedFailure('x', 5);
    expect(seedFailedRecently('x', 6)).toBe(true);
  });
});
