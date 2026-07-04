// Phone-side list of PCs this phone has paired with, remembered independently
// of network reachability. The session-token model (auth.ts TOKEN_KEY /
// PHONE_TOKEN_KEY) is a single active slot - this module adds a per-PC
// record layer on top of it: each successful claim persists a record here,
// and one record's token/relay-region is mirrored into that single active
// slot at a time via activatePairedPc.

import { storePhoneToken, hasSessionToken, getTokenSync } from './auth';
import { setRelayRegion } from './service';
import { PANEL_DEVICE_ID_KEY } from '../app/panelRouting';

export interface PairedPcRecord {
  id: string;
  machineName: string;
  token: string;
  // PC's leaf TLS cert fingerprint - present on a relay claim, or a LAN claim
  // that carried the QR's `fp` param. The most stable dedup key: survives a
  // DHCP-reassigned LAN address.
  spki?: string;
  // LAN address, present on a LAN claim. Falls back to a host match for
  // dedup when spki isn't known (e.g. a same-origin claim with no QR fp).
  host?: string;
  httpPort?: string;
  relayRegion?: string;
  lastConnectedAt: number;
  // Set when a connect attempt against this record's token failed
  // authorization (revoked/expired). Cleared by the next successful
  // upsertPairedPc for this same record.
  needsRepair?: boolean;
}

const STORAGE_KEY = 'nexus_paired_pcs';
const ACTIVE_ID_KEY = 'nexus_active_pc_id';
const LEGACY_RELAY_REGION_KEY = 'nexus.relayRegion';

function generateId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `pc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function readRaw(): PairedPcRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r): r is PairedPcRecord =>
      !!r && typeof r === 'object' && typeof (r as PairedPcRecord).id === 'string'
      && typeof (r as PairedPcRecord).token === 'string');
  } catch {
    return [];
  }
}

function writeRaw(records: PairedPcRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // localStorage unavailable/full - the caller still gets the in-memory
    // result; it does not survive a reload.
  }
}

let migrated = false;

/**
 * Installs that predate this module have a single-slot session token and no
 * STORAGE_KEY entry at all - synthesize one record from that state so an
 * existing pairing survives the upgrade without a re-pair. No-ops once a
 * STORAGE_KEY exists (including an empty array, e.g. after removing the last
 * record), so migration never resurrects a deliberately-cleared list.
 */
function ensureMigrated(): void {
  if (migrated) return;
  migrated = true;
  if (localStorage.getItem(STORAGE_KEY) != null) return;
  if (!hasSessionToken()) return;
  const token = getTokenSync();
  if (!token) return;
  const record: PairedPcRecord = {
    id: generateId(),
    machineName: '',
    token,
    relayRegion: localStorage.getItem(LEGACY_RELAY_REGION_KEY) || undefined,
    lastConnectedAt: Date.now(),
  };
  writeRaw([record]);
  localStorage.setItem(ACTIVE_ID_KEY, record.id);
}

export function listPairedPcs(): PairedPcRecord[] {
  ensureMigrated();
  return readRaw().sort((a, b) => b.lastConnectedAt - a.lastConnectedAt);
}

export function getActivePcId(): string | null {
  ensureMigrated();
  return localStorage.getItem(ACTIVE_ID_KEY);
}

export interface UpsertPairedPcInput {
  machineName?: string;
  token: string;
  spki?: string;
  host?: string;
  httpPort?: string;
  relayRegion?: string;
}

/**
 * spki is the strong identity signal: once known on the incoming claim, only
 * a record sharing that exact spki - or a record with NO spki of its own yet
 * (never spki-verified, upgradeable) - is a candidate. A record that already
 * carries a DIFFERENT spki is never matched by host alone: a reused DHCP
 * lease putting a different physical PC on the same LAN address must not
 * silently overwrite that PC's record.
 */
function findExisting(records: PairedPcRecord[], input: UpsertPairedPcInput): PairedPcRecord | undefined {
  if (input.spki) {
    const bySpki = records.find(r => r.spki && r.spki === input.spki);
    if (bySpki) return bySpki;
    if (input.host) {
      return records.find(r => !r.spki && r.host && r.host.toLowerCase() === input.host!.toLowerCase());
    }
    return undefined;
  }
  if (input.host) {
    return records.find(r => r.host && r.host.toLowerCase() === input.host!.toLowerCase());
  }
  return undefined;
}

/**
 * Called on every successful claim. Dedups by spki, else by host (see
 * findExisting). When neither matches, one more narrow case still resolves
 * to an existing record instead of inserting a new one: the pre-this-module
 * migrated record (ensureMigrated), which is born with neither spki nor host
 * and so can never dedup on its own. If it is STILL the active record and
 * needs repair - meaning the only claim that has happened since is the
 * user's own re-pair of it, not an unrelated new PC - the fresh claim
 * resolves it into a properly identified record instead of leaving a
 * permanent, unmatchable duplicate. Any record that already carries an spki
 * or host of its own is excluded: a mismatch there is a genuinely different
 * PC, not this record waiting to be identified.
 */
export function upsertPairedPc(input: UpsertPairedPcInput): PairedPcRecord {
  ensureMigrated();
  const records = readRaw();
  const existing = findExisting(records, input) ?? records.find(r =>
    r.id === localStorage.getItem(ACTIVE_ID_KEY) && r.needsRepair && !r.spki && !r.host);
  const merged: PairedPcRecord = {
    id: existing?.id ?? generateId(),
    machineName: input.machineName || existing?.machineName || '',
    token: input.token,
    spki: input.spki ?? existing?.spki,
    host: input.host ?? existing?.host,
    httpPort: input.httpPort ?? existing?.httpPort,
    relayRegion: input.relayRegion ?? existing?.relayRegion,
    lastConnectedAt: Date.now(),
  };
  const next = existing
    ? records.map(r => (r.id === existing.id ? merged : r))
    : [...records, merged];
  writeRaw(next);
  localStorage.setItem(ACTIVE_ID_KEY, merged.id);
  return merged;
}

/**
 * Applies a stored record's token + relay region to the live single-slot
 * session state and clears the cached panel-device-id (that id names a
 * layout record on the PREVIOUS active PC, meaningless on this one -
 * PanelEntrypoint's allocate-or-recover flow allocates a fresh one). Callers
 * still need to navigate/reload into /panel/phone for the new transport
 * state to take effect - this only updates the persisted state.
 */
export function activatePairedPc(id: string): PairedPcRecord | null {
  ensureMigrated();
  const record = readRaw().find(r => r.id === id);
  if (!record) return null;
  storePhoneToken(record.token);
  setRelayRegion(record.relayRegion ?? '');
  try {
    localStorage.removeItem(PANEL_DEVICE_ID_KEY);
  } catch {
    // Not critical - a stale cached id costs one extra 404+reallocate round
    // trip in PanelEntrypoint's allocate-or-recover flow.
  }
  localStorage.setItem(ACTIVE_ID_KEY, id);
  return record;
}

export function removePairedPc(id: string): void {
  ensureMigrated();
  writeRaw(readRaw().filter(r => r.id !== id));
  if (localStorage.getItem(ACTIVE_ID_KEY) === id) {
    localStorage.removeItem(ACTIVE_ID_KEY);
  }
}

/**
 * Called when a connect attempt against the active record's token fails
 * authorization. Best-effort no-op when nothing is active (e.g. a fresh
 * install with no stored PCs yet).
 */
export function markActivePcNeedsRepair(): void {
  const activeId = getActivePcId();
  if (!activeId) return;
  const records = readRaw();
  if (!records.some(r => r.id === activeId)) return;
  writeRaw(records.map(r => (r.id === activeId ? { ...r, needsRepair: true } : r)));
}
