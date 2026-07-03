import { describe, it, expect, beforeEach, vi } from 'vitest';

const ACTIVE_ID_KEY = 'nexus_active_pc_id';
const TOKEN_KEY = 'nexus_token';
const PHONE_TOKEN_KEY = 'nexus_phone_token';
const RELAY_REGION_KEY = 'nexus.relayRegion';
const PANEL_DEVICE_ID_KEY = 'nexus_panel_device_id';

let mod: typeof import('./pairedPcs');

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  mod = await import('./pairedPcs');
});

describe('upsertPairedPc', () => {
  it('inserts a new record and marks it active', () => {
    const record = mod.upsertPairedPc({ machineName: 'Tower', token: 't1', spki: 'AA:BB' });
    expect(record.machineName).toBe('Tower');
    expect(record.token).toBe('t1');
    expect(mod.listPairedPcs()).toEqual([record]);
    expect(mod.getActivePcId()).toBe(record.id);
  });

  it('dedups by spki across a LAN then relay claim of the same PC', () => {
    const first = mod.upsertPairedPc({ machineName: 'Tower', token: 't1', spki: 'AA:BB', host: '192.168.1.50', httpPort: '9400' });
    const second = mod.upsertPairedPc({ machineName: 'Tower', token: 't2', spki: 'AA:BB', relayRegion: 'us' });

    expect(second.id).toBe(first.id);
    const all = mod.listPairedPcs();
    expect(all).toHaveLength(1);
    expect(all[0].token).toBe('t2');
    // host/httpPort from the earlier LAN claim survive the relay-only update.
    expect(all[0].host).toBe('192.168.1.50');
    expect(all[0].relayRegion).toBe('us');
  });

  it('dedups by host when spki is unavailable on either side', () => {
    const first = mod.upsertPairedPc({ machineName: 'Tower', token: 't1', host: '192.168.1.50', httpPort: '9400' });
    const second = mod.upsertPairedPc({ machineName: 'Tower (renamed)', token: 't2', host: '192.168.1.50', httpPort: '9400' });

    expect(second.id).toBe(first.id);
    expect(mod.listPairedPcs()).toHaveLength(1);
    expect(mod.listPairedPcs()[0].machineName).toBe('Tower (renamed)');
  });

  it('creates separate records for two different PCs', () => {
    mod.upsertPairedPc({ machineName: 'Tower', token: 't1', spki: 'AA:BB' });
    mod.upsertPairedPc({ machineName: 'Laptop', token: 't2', spki: 'CC:DD' });
    expect(mod.listPairedPcs()).toHaveLength(2);
  });

  it('never merges two records that share neither spki nor host', () => {
    mod.upsertPairedPc({ machineName: 'Tower', token: 't1' });
    mod.upsertPairedPc({ machineName: 'Tower', token: 't2' });
    expect(mod.listPairedPcs()).toHaveLength(2);
  });

  it('does not let a reused LAN address (DHCP) hijack a different PC\'s spki-identified record', () => {
    const tower = mod.upsertPairedPc({ machineName: 'Tower', token: 't1', spki: 'AA:BB', host: '192.168.1.50' });
    // A different physical PC now claims a spki that matches nothing, on the
    // SAME LAN address Tower previously had (a reused DHCP lease) - it must
    // become a new record, not silently overwrite Tower's.
    const laptop = mod.upsertPairedPc({ machineName: 'Laptop', token: 't2', spki: 'CC:DD', host: '192.168.1.50' });

    expect(laptop.id).not.toBe(tower.id);
    const all = mod.listPairedPcs();
    expect(all).toHaveLength(2);
    expect(all.find(r => r.id === tower.id)?.token).toBe('t1');
    expect(all.find(r => r.id === tower.id)?.spki).toBe('AA:BB');
  });

  it('upgrades a host-only record via spki when the host matches and the existing record has no spki of its own', () => {
    const first = mod.upsertPairedPc({ machineName: 'Tower', token: 't1', host: '192.168.1.50' });
    // Same PC, later claim finally carries its spki (e.g. the QR fp param
    // reached this claim this time) - the pre-existing host-only record for
    // this same address absorbs it rather than duplicating.
    const second = mod.upsertPairedPc({ machineName: 'Tower', token: 't2', spki: 'AA:BB', host: '192.168.1.50' });

    expect(second.id).toBe(first.id);
    expect(mod.listPairedPcs()).toHaveLength(1);
    expect(mod.listPairedPcs()[0].spki).toBe('AA:BB');
  });

  it('resolves a re-paired migrated (identity-less) ghost record into the fresh claim instead of duplicating it', () => {
    localStorage.setItem(TOKEN_KEY, 'legacy-token');
    const [ghost] = mod.listPairedPcs(); // triggers migration
    expect(ghost.spki).toBeUndefined();
    expect(ghost.host).toBeUndefined();
    mod.markActivePcNeedsRepair();

    const repaired = mod.upsertPairedPc({ machineName: 'Tower', token: 'fresh-token', spki: 'AA:BB' });

    expect(repaired.id).toBe(ghost.id);
    expect(mod.listPairedPcs()).toHaveLength(1);
    expect(mod.listPairedPcs()[0].needsRepair).toBeUndefined();
  });

  it('does NOT absorb an unrelated new PC into an active needsRepair record that already has its own identity', () => {
    const tower = mod.upsertPairedPc({ machineName: 'Tower', token: 't1', spki: 'AA:BB' });
    mod.markActivePcNeedsRepair(); // Tower is active + needsRepair, but keeps its own spki

    const laptop = mod.upsertPairedPc({ machineName: 'Laptop', token: 't2', spki: 'CC:DD' });

    expect(laptop.id).not.toBe(tower.id);
    expect(mod.listPairedPcs()).toHaveLength(2);
    expect(mod.listPairedPcs().find(r => r.id === tower.id)?.needsRepair).toBe(true);
  });

  it('clears a prior needsRepair flag on re-claim', () => {
    const record = mod.upsertPairedPc({ machineName: 'Tower', token: 't1', spki: 'AA:BB' });
    mod.markActivePcNeedsRepair();
    expect(mod.listPairedPcs().find(r => r.id === record.id)?.needsRepair).toBe(true);

    mod.upsertPairedPc({ machineName: 'Tower', token: 't2', spki: 'AA:BB' });
    expect(mod.listPairedPcs().find(r => r.id === record.id)?.needsRepair).toBeUndefined();
  });

  it('sorts listPairedPcs by lastConnectedAt descending', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    mod.upsertPairedPc({ machineName: 'Older', token: 't1', spki: 'AA' });
    vi.setSystemTime(2000);
    mod.upsertPairedPc({ machineName: 'Newer', token: 't2', spki: 'BB' });
    expect(mod.listPairedPcs().map(r => r.machineName)).toEqual(['Newer', 'Older']);
    vi.useRealTimers();
  });
});

describe('activatePairedPc', () => {
  it('applies the record token + relay region to the live single-slot state and clears the cached panel device id', () => {
    const record = mod.upsertPairedPc({ machineName: 'Tower', token: 'live-token', spki: 'AA:BB', relayRegion: 'ap' });
    localStorage.setItem(PANEL_DEVICE_ID_KEY, 'stale-device-id');

    const applied = mod.activatePairedPc(record.id);

    expect(applied).toEqual(record);
    expect(localStorage.getItem(TOKEN_KEY)).toBe('live-token');
    expect(localStorage.getItem(PHONE_TOKEN_KEY)).toBe('live-token');
    expect(localStorage.getItem(RELAY_REGION_KEY)).toBe('ap');
    expect(localStorage.getItem(PANEL_DEVICE_ID_KEY)).toBeNull();
    expect(localStorage.getItem(ACTIVE_ID_KEY)).toBe(record.id);
  });

  it('returns null for an unknown id and does not touch the live token', () => {
    localStorage.setItem(TOKEN_KEY, 'untouched');
    expect(mod.activatePairedPc('missing')).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBe('untouched');
  });
});

describe('removePairedPc', () => {
  it('removes the record and clears the active pointer if it was active', () => {
    const record = mod.upsertPairedPc({ machineName: 'Tower', token: 't1', spki: 'AA:BB' });
    expect(mod.getActivePcId()).toBe(record.id);

    mod.removePairedPc(record.id);

    expect(mod.listPairedPcs()).toEqual([]);
    expect(mod.getActivePcId()).toBeNull();
  });

  it('leaves the active pointer alone when removing a non-active record', () => {
    const a = mod.upsertPairedPc({ machineName: 'A', token: 't1', spki: 'AA' });
    const b = mod.upsertPairedPc({ machineName: 'B', token: 't2', spki: 'BB' });
    expect(mod.getActivePcId()).toBe(b.id);

    mod.removePairedPc(a.id);

    expect(mod.listPairedPcs().map(r => r.id)).toEqual([b.id]);
    expect(mod.getActivePcId()).toBe(b.id);
  });
});

describe('markActivePcNeedsRepair', () => {
  it('no-ops when nothing is active', () => {
    expect(() => mod.markActivePcNeedsRepair()).not.toThrow();
    expect(mod.listPairedPcs()).toEqual([]);
  });
});

describe('migration from the legacy single-slot token', () => {
  it('synthesizes one record and marks it active when a token exists but no paired-PC list does', () => {
    localStorage.setItem(TOKEN_KEY, 'legacy-token');
    localStorage.setItem(RELAY_REGION_KEY, 'eu');

    const records = mod.listPairedPcs();

    expect(records).toHaveLength(1);
    expect(records[0].token).toBe('legacy-token');
    expect(records[0].relayRegion).toBe('eu');
    expect(mod.getActivePcId()).toBe(records[0].id);
  });

  it('does not migrate when no session token exists', () => {
    expect(mod.listPairedPcs()).toEqual([]);
    expect(mod.getActivePcId()).toBeNull();
  });

  it('does not resurrect a deliberately emptied list on a later call', () => {
    localStorage.setItem(TOKEN_KEY, 'legacy-token');
    mod.listPairedPcs(); // triggers migration -> one record
    const [record] = mod.listPairedPcs();
    mod.removePairedPc(record.id);

    expect(mod.listPairedPcs()).toEqual([]);
  });
});
