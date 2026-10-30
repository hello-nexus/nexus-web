import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { directApiBackend } from '../../api/directApiBackend';
import type { AuthAccount } from '../../api/authBackend';

// Consumed through @app by the Build portal; nothing inside this repo
// imports it.

export interface UsePublicAccountResult {
  /** undefined while the initial silent-refresh load is in flight. */
  account: AuthAccount | null | undefined;
  /**
   * What to draw before the silent refresh answers: the verified account once known, else the last-known one from this
   * browser (name and avatar only), null for a last-known signed-out visit, undefined on a first visit. Drives display
   * only; never gate anything on it.
   */
  shown: AccountHint | null | undefined;
  refresh: () => Promise<void>;
}

export type AccountHint = Pick<AuthAccount, 'username' | 'avatar'>;

const HINT_KEY = 'nexus_account_hint';

// The page paints before the refresh round trip returns; this is what that paint uses. No email or id is kept.
function readHint(): AccountHint | null | undefined {
  try {
    const raw = window.localStorage.getItem(HINT_KEY);
    if (raw === null) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null) return null;
    if (typeof parsed === 'object' && typeof (parsed as AccountHint).username === 'string') {
      const { username, avatar } = parsed as AccountHint;
      return { username, avatar: avatar ?? null };
    }
  } catch { /* storage unavailable or malformed: no hint */ }
  return undefined;
}

function writeHint(account: AuthAccount | null): void {
  try {
    window.localStorage.setItem(HINT_KEY, JSON.stringify(account ? { username: account.username, avatar: account.avatar } : null));
  } catch { /* storage unavailable: the next visit paints without a hint */ }
}

// Public web has no local service to hold a session across page loads, so the
// account is re-derived from DirectApiBackend's silent refresh once per page
// load. Every caller shares that one copy: the header and the page body must
// agree, so a sign-in or sign-out that refreshes through one reaches all.
let current: AuthAccount | null | undefined;
const hint = readHint();
let started = false;
let latest = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function snapshot(): AuthAccount | null | undefined {
  return current;
}

/** Latest call wins, so a load that started before a sign-in cannot overwrite it. */
async function load(): Promise<void> {
  const call = ++latest;
  const account = await directApiBackend.getAccount();
  if (call !== latest) return;
  current = account;
  writeHint(account);
  for (const listener of listeners) listener();
}

export function usePublicAccount(): UsePublicAccountResult {
  const account = useSyncExternalStore(subscribe, snapshot, snapshot);

  // A signed-out result is re-checked by each view that mounts later, so a
  // network blip on the first load does not stick for the whole visit.
  useEffect(() => {
    if (started && current !== null) return;
    started = true;
    void load();
  }, []);

  const refresh = useCallback(() => load(), []);

  return { account, shown: account === undefined ? hint : account, refresh };
}
