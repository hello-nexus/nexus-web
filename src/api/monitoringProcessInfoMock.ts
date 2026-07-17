// Contract-shaped fixture for GET /monitoring/process-info, used only as a
// dev-build fallback while the service route is still being built (parallel
// branch). Every field is a pure function of `name` and the current time (no
// Math.random, no fixed anchor date), so the slideout always shows plausible,
// still-fresh data regardless of when it's opened. Known process names get a
// realistic profile matching monitoringHistoryAppsMock.ts's app list; an
// unrecognized name still resolves to a generic-but-plausible profile instead
// of an empty response, so the mock never looks broken while iterating on a
// process the fixture list doesn't know about.

import type { ProcessInfoResponse } from './monitoringProcessInfo';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

interface ProcessProfile {
  path: string;
  description: string;
  version: string;
  company: string;
  publisher: string;
  signed: boolean;
  instanceCount: number;
  startedMinutesAgo: number;
  createdDaysAgo: number;
  modifiedDaysAgo: number;
  firstSeenDaysAgo: number;
}

const PROFILES: Record<string, ProcessProfile> = {
  'chrome.exe': {
    path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    description: 'Google Chrome',
    version: '124.0.6367.91',
    company: 'Google LLC',
    publisher: 'Google LLC',
    signed: true,
    instanceCount: 14,
    startedMinutesAgo: 240,
    createdDaysAgo: 40,
    modifiedDaysAgo: 6,
    firstSeenDaysAgo: 210,
  },
  Nexus: {
    path: 'C:\\Program Files\\Nexus\\Nexus.exe',
    description: 'Nexus',
    version: '3.0.0',
    company: 'Nexus',
    publisher: 'Nexus',
    signed: true,
    instanceCount: 1,
    startedMinutesAgo: 480,
    createdDaysAgo: 5,
    modifiedDaysAgo: 5,
    firstSeenDaysAgo: 60,
  },
  'Discord.exe': {
    path: 'C:\\Users\\nicol\\AppData\\Local\\Discord\\app-1.0.9187\\Discord.exe',
    description: 'Discord',
    version: '1.0.9187',
    company: 'Discord Inc.',
    publisher: 'Discord Inc.',
    signed: true,
    instanceCount: 3,
    startedMinutesAgo: 90,
    createdDaysAgo: 12,
    modifiedDaysAgo: 12,
    firstSeenDaysAgo: 180,
  },
  'explorer.exe': {
    path: 'C:\\Windows\\explorer.exe',
    description: 'Windows Explorer',
    version: '10.0.22631.3527',
    company: 'Microsoft Corporation',
    publisher: 'Microsoft Windows',
    signed: true,
    instanceCount: 1,
    startedMinutesAgo: 720,
    createdDaysAgo: 300,
    modifiedDaysAgo: 33,
    firstSeenDaysAgo: 365,
  },
  'Code.exe': {
    path: 'C:\\Users\\nicol\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe',
    description: 'Visual Studio Code',
    version: '1.89.1',
    company: 'Microsoft Corporation',
    publisher: 'Microsoft Corporation',
    signed: true,
    instanceCount: 2,
    startedMinutesAgo: 15,
    createdDaysAgo: 28,
    modifiedDaysAgo: 9,
    firstSeenDaysAgo: 150,
  },
  'Spotify.exe': {
    path: 'C:\\Users\\nicol\\AppData\\Roaming\\Spotify\\Spotify.exe',
    description: 'Spotify',
    version: '1.2.42.446',
    company: 'Spotify AB',
    publisher: 'Spotify AB',
    signed: true,
    instanceCount: 1,
    startedMinutesAgo: 300,
    createdDaysAgo: 70,
    modifiedDaysAgo: 20,
    firstSeenDaysAgo: 200,
  },
};

// A small, unkeyed hash so an unrecognized process name still resolves to a
// stable-looking profile (same shape every call) instead of one that reads
// as obviously fake.
function hashSeed(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h;
}

function genericProfile(name: string): ProcessProfile {
  const seed = hashSeed(name);
  return {
    path: `C:\\Program Files\\${name.replace(/\.exe$/i, '')}\\${name}`,
    description: name.replace(/\.exe$/i, ''),
    version: `${1 + (seed % 4)}.${(seed >> 2) % 10}.${(seed >> 5) % 100}`,
    company: 'Unknown Publisher',
    publisher: 'Unknown Publisher',
    signed: seed % 3 !== 0,
    instanceCount: 1 + (seed % 3),
    startedMinutesAgo: 5 + (seed % 600),
    createdDaysAgo: 10 + (seed % 300),
    modifiedDaysAgo: 1 + (seed % 30),
    firstSeenDaysAgo: 20 + (seed % 300),
  };
}

/** Deterministic 64-char hex string standing in for a SHA-256 digest - a
 *  pure function of `name` so the mock is stable across calls without
 *  actually hashing file bytes (there is no real file to hash in a mock). */
function fakeSha256(name: string): string {
  let x = hashSeed(name) || 1;
  let out = '';
  for (let i = 0; i < 64; i++) {
    // xorshift32 - cheap, deterministic, good enough spread for a fixture.
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    out += (x % 16).toString(16);
  }
  return out;
}

export function mockMonitoringProcessInfo(name: string): ProcessInfoResponse {
  const profile = PROFILES[name] ?? genericProfile(name);
  const now = Date.now();
  return {
    supported: true,
    name,
    path: profile.path,
    instanceCount: profile.instanceCount,
    startedAtMs: now - profile.startedMinutesAgo * MINUTE_MS,
    description: profile.description,
    version: profile.version,
    company: profile.company,
    publisher: profile.publisher,
    signed: profile.signed,
    sha256: fakeSha256(name),
    createdAtMs: now - profile.createdDaysAgo * DAY_MS,
    modifiedAtMs: now - profile.modifiedDaysAgo * DAY_MS,
    firstSeenMs: now - profile.firstSeenDaysAgo * DAY_MS,
  };
}
