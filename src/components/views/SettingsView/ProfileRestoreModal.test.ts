import { describe, expect, it } from 'vitest';
import { appDataNames, readableAppName } from './ProfileRestoreModal';

describe('readableAppName', () => {
  it('capitalizes the last id segment', () => {
    expect(readableAppName('com.hellonexus.aquarium')).toBe('Aquarium');
    expect(readableAppName('com.hellonexus.gundam-strike')).toBe('Gundam Strike');
    expect(readableAppName('plain')).toBe('Plain');
  });
});

describe('appDataNames', () => {
  it('falls back to the readable id when the app is not installed', () => {
    expect(appDataNames(['com.hellonexus.aquarium'])).toEqual(['Aquarium']);
  });
});
