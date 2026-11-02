import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { directApiBackend } from '../../api/directApiBackend';
import type { AuthAccount } from '../../api/authBackend';
import { readAccountHint, writeAccountHint, type AccountHint } from '../../api/accountHint';

// Consumed through @app by the Build portal; nothing inside this repo
// imports it.

export interface UsePublicAccountResult {
  /** undefined while the initial silent-refresh load is in flight. */
  account: AuthAccount | null | undefined;
  /**
   * What to draw before the silent refresh answers: the verified account once known, else the last-known one from this
   * browser (name and avatar only), null for a last-known signed-out visit, undefined on a first visit. For display and
   * prefetch only (a request carries the real session); never authorize or redirect on it.
   */
  shown: AccountHint | null | undefined;
  /**
   * Whether `account === null` is a definite sign-out or a check that could not be made (offline, server error), for
   * callers that must not act on a sign-out they cannot confirm. 'loading' until the first check answers.
   */
  session: 'loading' | 'signedIn' | 'signedOut' | 'unreachable';
  refresh: () => Promise<void>;
}

export type { AccountHint };

// Public web has no local service to hold a session across page loads, so the
// account is re-derived from DirectApiBackend's silent refresh once per page
// load. Every caller shares that one copy: the header and the page body must
// agree, so a sign-in or sign-out that refreshes through one reaches all.
let current: AuthAccount | null | undefined;
let session: UsePublicAccountResult['session'] = 'loading';
const hint = readAccountHint();
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

function sessionSnapshot(): UsePublicAccountResult['session'] {
  return session;
}

/** Latest call wins, so a load that started before a sign-in cannot overwrite it. */
async function load(): Promise<void> {
  const call = ++latest;
  // A backend that cannot tell the two apart reports a null account as signed out, as it always did.
  const check = directApiBackend.checkAccount
    ? await directApiBackend.checkAccount()
    : await directApiBackend.getAccount().then((a) => (a ? { state: 'signedIn' as const, account: a } : { state: 'signedOut' as const }));
  if (call !== latest) return;
  const account = check.state === 'signedIn' ? check.account : null;
  current = account;
  session = check.state;
  if (check.state !== 'unreachable') writeAccountHint(account);
  for (const listener of listeners) listener();
}

export function usePublicAccount(): UsePublicAccountResult {
  const account = useSyncExternalStore(subscribe, snapshot, snapshot);
  const sessionNow = useSyncExternalStore(subscribe, sessionSnapshot, sessionSnapshot);

  // A signed-out result is re-checked by each view that mounts later, so a
  // network blip on the first load does not stick for the whole visit.
  useEffect(() => {
    if (started && current !== null) return;
    started = true;
    void load();
  }, []);

  const refresh = useCallback(() => load(), []);

  return { account, session: account === undefined ? 'loading' : sessionNow, shown: account === undefined ? hint : account, refresh };
}
