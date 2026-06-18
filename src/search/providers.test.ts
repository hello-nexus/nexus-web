import { describe, it, expect } from 'vitest';
import { buildEntries } from './providers';
import type { CommandContext } from './types';

function ctx(online: boolean): CommandContext {
  return {
    t: (k: string) => k,
    online,
    devices: [],
    settings: {
      themeMode: 'dark', accentColor: '#2563eb', language: 'en',
      showWindowsTrayIcon: true, showMacStatusBarIcon: false, disableConflictAlerts: false,
    } as CommandContext['settings'],
    updateSettings: () => {},
    panel: { remoteEnabled: true, relayEnabled: false, wifiEnabled: false },
    profiles: [{ id: 'default', name: 'Default' }, { id: 'gaming', name: 'Gaming' }],
    activeProfileId: 'default',
    switchProfile: () => {},
    host: { goView: () => {}, goSection: () => {}, pairPhone: () => {} },
    close: () => {},
  };
}

const idsOf = (online: boolean) => new Set(buildEntries(ctx(online)).map((e) => e.id));

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
    expect(find('toggle:menubar').toggle).toBe(false); // showMacStatusBarIcon = false
  });

  it('switches profiles (action); the Profiles page is the open half', () => {
    const ids = idsOf(true);
    expect(ids.has('profile:default')).toBe(true);
    expect(ids.has('profile:gaming')).toBe(true);
    expect(ids.has('page:profiles')).toBe(true);
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

  it('has no music-reactive entry (no such mode)', () => {
    expect([...idsOf(true)].some((id) => id.includes('music'))).toBe(false);
  });

  it('lists every built-in app that ships a page, opening that page', () => {
    const entries = buildEntries(ctx(true));
    const find = (id: string) => entries.find((e) => e.id === id);
    // Page-bearing apps not already covered by a curated NAV row.
    for (const type of ['clock', 'gallery', 'steam', 'smart-lights']) {
      expect(find(`app:${type}`)?.kind).toBe('navigate');
    }
    // Page-less apps are never listed.
    for (const type of ['calculator', 'emoji', 'timer']) {
      expect(find(`app:${type}`)).toBeUndefined();
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

  it('applies directly vs opens the page per the action/navigate rule', () => {
    const entries = buildEntries(ctx(true));
    const kind = (id: string) => entries.find((e) => e.id === id)?.kind;
    // Immediate applies:
    expect(kind('effect:plasma')).toBe('action');
    expect(kind('cooling:balanced')).toBe('action');
    expect(kind('lighting-mode:none')).toBe('action');
    expect(kind('lighting-mode:screen')).toBe('action');
    // Need more input → open the page:
    expect(kind('cooling:custom')).toBe('navigate');
    expect(kind('lighting-mode:gif')).toBe('navigate');
    expect(kind('lighting-mode:animate')).toBe('navigate');
    // Plain navigation:
    expect(kind('nav:lighting')).toBe('navigate');
    expect(kind('settings:general')).toBe('navigate');
  });
});
