// Dev-only stand-in for the isApp/publisher/signed fields the service is
// adding to the live "processes" wire entry on a parallel branch (round 5
// items 5/6: Apps/Background grouping, publisher + Unsigned badge). A
// curated table classifies a few recognizable process names - matching
// monitoringHistoryAppsMock.ts's/monitoringProcessInfoMock.ts's own app
// list - so the grouping and publisher/signature rendering are visible
// before the real fields land. An unlisted name returns undefined, which
// the caller treats the same as production's "no data yet" fallback
// (background, no publisher, no signature badge).

export interface ProcessMetaMock {
  isApp: boolean;
  publisher: string | null;
  signed: 'signed' | 'unsigned' | 'unknown';
}

const MOCK_TABLE: Record<string, ProcessMetaMock> = {
  'chrome.exe': { isApp: true, publisher: 'Google LLC', signed: 'signed' },
  'Discord.exe': { isApp: true, publisher: 'Discord Inc.', signed: 'signed' },
  'Code.exe': { isApp: true, publisher: 'Microsoft Corporation', signed: 'signed' },
  'Spotify.exe': { isApp: true, publisher: 'Spotify AB', signed: 'signed' },
  Nexus: { isApp: true, publisher: 'Nexus', signed: 'signed' },
  'explorer.exe': { isApp: false, publisher: 'Microsoft Corporation', signed: 'signed' },
  // Exercises the unsigned badge and the "no publisher" render-nothing path
  // together - a plausible tool with no resolvable signer.
  'sketchy-tool.exe': { isApp: true, publisher: null, signed: 'unsigned' },
};

export function mockProcessMeta(name: string): ProcessMetaMock | undefined {
  return MOCK_TABLE[name];
}
