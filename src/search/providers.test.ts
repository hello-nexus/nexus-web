import { describe, it, expect } from 'vitest';
import { buildEntries } from './providers';
import type { CommandContext } from './types';
import { EMPTY_LIVE_STATE, type SearchLiveState } from './useSearchLiveState';
import type { LightingDevice } from '../api/lighting';

// A fully-populated live snapshot, so every live-gated source emits.
const LIVE: SearchLiveState = {
  musicReactive: true,
  telemetry: false,
  tracking: true,
  globalBrightness: 0.5,
  lightingDevices: [
    { id: 'dev1', name: 'Strip One', ledsOn: true, ledCount: 10, canvasX: 0, canvasY: 0, canvasW: 1, canvasH: 1, canvasRotation: 0 } as LightingDevice,
  ],
  smartLights: {
    devices: [{ id: 'sl1', brand: 'hue', name: 'Desk Bulb', host: 'h', online: true, enabled: true, ledCount: 1 }],
    brandEnabled: { hue: true, govee: false },
  },
  obs: {
    error: false, msg: '', connected: true, host: 'localhost', port: 4455,
    activeScene: 'Main', scenes: [], recording: false, streaming: true,
    recordingDurationMs: 0, streamingDurationMs: 0,
  },
  discord: {
    error: false, msg: '', ready: true, configured: true, connected: true,
    needsAuthorization: false, reason: '', guilds: [], notifications: [],
    voiceState: {
      channelName: 'General', guildName: 'G', guildId: '1', channelId: '2',
      selfMute: true, selfDeaf: false, participants: [],
    },
  },
  cloud: { accounts: [], activeAccountId: 'acc1' },
  volume: { supported: true, volume: 0.4, muted: false },
};

function ctx(online: boolean, over?: Partial<CommandContext>): CommandContext {
  return {
    t: (k: string) => k,
    online,
    devices: [],
    settings: {
      themeMode: 'dark', accentColor: '#2563eb', language: 'en', backgroundMode: 'flat',
      showWindowsTrayIcon: true, showMacStatusBarIcon: false, showConflictAlerts: false,
      updateMode: 'always', updateChannel: 'production',
    } as CommandContext['settings'],
    updateSettings: () => {},
    panel: { remoteEnabled: true, relayEnabled: false, wifiEnabled: false },
    platform: 'windows',
    live: online ? LIVE : EMPTY_LIVE_STATE,
    profiles: [{ id: 'default', name: 'Default' }, { id: 'gaming', name: 'Gaming' }],
    activeProfileId: 'default',
    switchProfile: () => {},
    host: { goView: () => {}, goSection: () => {}, pairPhone: () => {} },
    close: () => {},
    ...over,
  };
}

const idsOf = (online: boolean, over?: Partial<CommandContext>) =>
  new Set(buildEntries(ctx(online, over)).map((e) => e.id));

describe('buildEntries', () => {
  it('covers every cooling preset and lighting mode (source-driven) plus all effects', () => {
    const ids = idsOf(true);
    // All 5 cooling presets, incl. custom.
    for (const k of ['off', 'silent', 'balanced', 'turbo', 'custom']) {
      expect(ids.has(`cooling:${k}`)).toBe(true);
    }
    // All 4 lighting modes, incl. media (gif).
    for (const k of ['none', 'screen', 'gif', 'animate']) {
      expect(ids.has(`lighting-mode:${k}`)).toBe(true);
    }
    expect(ids.has('effect:plasma')).toBe(true);
    expect(ids.has('effect:fire')).toBe(true);
  });

  it('exposes remote/relay/wifi as single toggles + the pairing open when online', () => {
    const ids = idsOf(true);
    for (const id of ['toggle:remote', 'toggle:relay', 'toggle:wifi', 'open:pairing']) {
      expect(ids.has(id)).toBe(true);
    }
    // No separate On/Off pair entries.
    for (const id of ['remote:on', 'remote:off', 'relay:on', 'relay:off', 'wifi:on', 'wifi:off']) {
      expect(ids.has(id)).toBe(false);
    }
  });

  it('toggles carry their current on/off state as a switch', () => {
    const find = (id: string) => buildEntries(ctx(true)).find((e) => e.id === id)!;
    expect(find('toggle:remote').toggle).toBe(true);   // panel.remoteEnabled = true
    expect(find('toggle:relay').toggle).toBe(false);   // relayEnabled = false
    expect(find('toggle:tray').toggle).toBe(true);     // showWindowsTrayIcon = true
  });

  it('switches profiles (action); the Profiles page is the open half', () => {
    const ids = idsOf(true);
    expect(ids.has('profile:default')).toBe(true);
    expect(ids.has('profile:gaming')).toBe(true);
    expect(ids.has('page:profiles')).toBe(true);
  });

  it('adds create + export-active profile management entries', () => {
    const entries = buildEntries(ctx(true));
    expect(entries.find((e) => e.id === 'profiles:create')?.kind).toBe('navigate');
    const exp = entries.find((e) => e.id === 'profiles:export');
    expect(exp?.kind).toBe('action');
    expect(exp?.title).toContain('Default'); // exports the ACTIVE profile
  });

  it('omits device-control + remote + profiles when offline, keeps navigation', () => {
    const ids = idsOf(false);
    expect(ids.has('cooling:balanced')).toBe(false);
    expect(ids.has('lighting-mode:none')).toBe(false);
    expect(ids.has('effect:plasma')).toBe(false);
    expect(ids.has('toggle:remote')).toBe(false);
    expect(ids.has('profile:default')).toBe(false);
    expect(ids.has('nav:lighting')).toBe(true);
    expect(ids.has('nav:settings')).toBe(true);
  });

  it('exposes music-reactive as a live toggle when the service reports it', () => {
    const entry = buildEntries(ctx(true)).find((e) => e.id === 'toggle:music-reactive');
    expect(entry?.toggle).toBe(true); // LIVE.musicReactive
    // Absent while the state never loaded (offline snapshot).
    expect(idsOf(false).has('toggle:music-reactive')).toBe(false);
  });

  it('lists every built-in app that ships a page, opening that page', () => {
    const entries = buildEntries(ctx(true));
    const find = (id: string) => entries.find((e) => e.id === id);
    // Page-bearing apps not already covered by a curated NAV row.
    for (const type of ['clock', 'gallery', 'steam', 'smart-lights']) {
      expect(find(`app:${type}`)?.kind).toBe('navigate');
    }
    // Page-less apps get an add-widget entry instead of a page open.
    for (const type of ['calculator', 'emoji', 'timer', 'weather', 'stocks', 'calendar']) {
      expect(find(`app:${type}`)).toBeUndefined();
      expect(find(`widget:${type}`)?.kind).toBe('navigate');
    }
    // Apps with a curated NAV row are not duplicated under app:*.
    for (const type of ['cooling', 'lighting', 'monitoring', 'screentime']) {
      expect(find(`app:${type}`)).toBeUndefined();
    }
  });

  it('lists app pages regardless of service connectivity', () => {
    const ids = idsOf(false);
    expect(ids.has('app:clock')).toBe(true);
    expect(ids.has('app:steam')).toBe(true);
  });

  it('deep-links routed subtabs', () => {
    const ids = idsOf(false);
    for (const id of [
      'nav:monitoring/cpu', 'nav:monitoring/network', 'nav:screentime/week',
      'nav:benchmark/leaderboards', 'nav:devices/firmware', 'nav:diagnostics/storage',
    ]) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it('keeps disconnected devices findable, flagged via hint', () => {
    const entries = buildEntries(ctx(true, {
      devices: [
        { key: 'a', name: 'Keeb', subtitle: '', iconSrc: '', connected: true },
        { key: 'b', name: 'Hub', subtitle: '', iconSrc: '', connected: false },
      ],
    }));
    expect(entries.find((e) => e.id === 'device:a')?.hint).toBeUndefined();
    expect(entries.find((e) => e.id === 'device:b')?.hint).toBe('search.hint.disconnected');
  });

  it('opens menu/header chrome: updates, about, discord, widget catalogs, device modals', () => {
    const ids = idsOf(false);
    for (const id of [
      'open:check-updates', 'open:about', 'open:discord-invite',
      'open:add-widget', 'open:desktop-widgets', 'open:connected-devices', 'open:supported-devices',
    ]) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it('gates platform-bound entries on ctx.platform', () => {
    const win = idsOf(true);
    const mac = idsOf(true, { platform: 'macos' });
    // Windows-only: update prefs, tray toggle + row, lock/sleep, event viewer.
    for (const id of ['update-mode:notify', 'update-channel:beta', 'toggle:tray', 'system:lock', 'system:sleep', 'diag:event-viewer', 'gamesync:scan']) {
      expect(win.has(id)).toBe(true);
      expect(mac.has(id)).toBe(false);
    }
    // macOS-only: the menu-bar toggle.
    expect(mac.has('toggle:menubar')).toBe(true);
    expect(win.has('toggle:menubar')).toBe(false);
  });

  it('exposes live-state toggles: telemetry, tracking, mute, per-device power, smart lights', () => {
    const find = (id: string) => buildEntries(ctx(true)).find((e) => e.id === id);
    expect(find('toggle:telemetry')?.toggle).toBe(false);
    expect(find('toggle:screentime-tracking')?.toggle).toBe(true);
    expect(find('system:mute')?.toggle).toBe(false);
    expect(find('light-power:dev1')?.toggle).toBe(true);
    expect(find('light-identify:dev1')?.kind).toBe('action');
    expect(find('smart-brand:hue')?.toggle).toBe(true);
    expect(find('smart-brand:govee')?.toggle).toBe(false);
    expect(find('smart-light:sl1')?.toggle).toBe(true);
  });

  it('exposes OBS + Discord controls only while their state is live', () => {
    const find = (id: string) => buildEntries(ctx(true)).find((e) => e.id === id);
    expect(find('obs:recording')?.toggle).toBe(false);
    expect(find('obs:streaming')?.toggle).toBe(true);
    expect(find('discord:mute')?.toggle).toBe(true);
    expect(find('discord:deafen')?.toggle).toBe(false);
    // Disconnected OBS / no voice channel -> no entries.
    const off = idsOf(true, {
      live: { ...LIVE, obs: { ...LIVE.obs!, connected: false }, discord: { ...LIVE.discord!, voiceState: null } },
    });
    for (const id of ['obs:recording', 'obs:streaming', 'discord:mute', 'discord:deafen']) {
      expect(off.has(id)).toBe(false);
    }
  });

  it('marks the current brightness step active and offers media transport', () => {
    const entries = buildEntries(ctx(true));
    expect(entries.find((e) => e.id === 'brightness:50')?.hint).toBe('search.hint.active');
    expect(entries.find((e) => e.id === 'brightness:75')?.hint).toBeUndefined();
    for (const id of ['media:playpause', 'media:next', 'media:previous']) {
      expect(entries.find((e) => e.id === id)?.kind).toBe('action');
    }
  });

  it('applies directly vs opens the page per the action/navigate rule', () => {
    const entries = buildEntries(ctx(true));
    const kind = (id: string) => entries.find((e) => e.id === id)?.kind;
    // Immediate applies:
    expect(kind('effect:plasma')).toBe('action');
    expect(kind('cooling:balanced')).toBe('action');
    expect(kind('lighting-mode:none')).toBe('action');
    expect(kind('lighting-mode:screen')).toBe('action');
    expect(kind('lighting:rescan')).toBe('action');
    expect(kind('diag:download-report')).toBe('action');
    // The reboot-arming memory test stays behind its page confirm - only the
    // subtab deep-link is offered.
    expect(kind('diag:memory-test')).toBeUndefined();
    expect(kind('nav:diagnostics/memory')).toBe('navigate');
    // Need more input → open the page:
    expect(kind('cooling:custom')).toBe('navigate');
    expect(kind('lighting-mode:gif')).toBe('navigate');
    expect(kind('lighting-mode:animate')).toBe('navigate');
    // Destructive flows stay behind their page confirms:
    expect(kind('setting:settings.shutDown.label')).toBe('navigate');
    expect(kind('setting:settings.factoryReset.label')).toBe('navigate');
    // Plain navigation:
    expect(kind('nav:lighting')).toBe('navigate');
    expect(kind('settings:general')).toBe('navigate');
  });

  it('indexes background modes as appearance actions', () => {
    const entries = buildEntries(ctx(true));
    const flat = entries.find((e) => e.id === 'appearance:background-flat');
    expect(flat?.kind).toBe('action');
    expect(flat?.hint).toBe('search.hint.active'); // settings.backgroundMode = flat
  });
});
