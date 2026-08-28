import { describe, it, expect, vi } from 'vitest';

// vitest.config.ts forces __OFFICIAL_BUILD__ true so the rest of the suite
// covers the shipped surface. Mocking the module is how the other shape gets
// tested at all - the same trick ProfileDropdown.prod.test.tsx uses for
// DEV_TOOLS. Without this file every hosted entry could leak back into a
// credential-less build unnoticed.
vi.mock('../lib/officialBuild', () => ({ OFFICIAL_BUILD: false }));

import { buildEntries } from './providers';
import type { CommandContext } from './types';
import { EMPTY_LIVE_STATE } from './useSearchLiveState';

function ctx(): CommandContext {
  return {
    t: (k: string) => k,
    online: true,
    devices: [],
    settings: {
      themeMode: 'dark', accentColor: '#2563eb', language: 'en', backgroundMode: 'flat',
      showWindowsTrayIcon: true, showMacStatusBarIcon: false, showConflictAlerts: false,
      updateMode: 'always', updateChannel: 'production',
    } as CommandContext['settings'],
    updateSettings: () => {},
    panel: { remoteEnabled: true, relayEnabled: false, wifiEnabled: false },
    platform: 'windows',
    live: EMPTY_LIVE_STATE,
    profiles: [{ id: 'default', name: 'Default' }],
    activeProfileId: 'default',
    switchProfile: () => {},
    host: { goView: () => {}, goSection: () => {}, pairPhone: () => {} },
    close: () => {},
  };
}

describe('command palette in a build with no credential', () => {
  const ids = new Set(buildEntries(ctx()).map((e) => e.id));

  it.each([
    'toggle:relay',
    'nav:benchmark/leaderboards',
    'open:check-updates',
    'setting:settings.updates.mode.label',
    'setting:settings.updates.channel.label',
    'update-mode:always',
    'update-channel:beta',
    'page:account',
  ])('does not offer %s', (id) => {
    expect(ids.has(id)).toBe(false);
  });

  it('keeps the remote killswitch, which is the only way to turn remote access off', () => {
    expect(ids.has('toggle:remote')).toBe(true);
  });

  it('keeps the local benchmark tabs', () => {
    expect(ids.has('nav:benchmark/run')).toBe(true);
    expect(ids.has('nav:benchmark/results')).toBe(true);
  });
});
