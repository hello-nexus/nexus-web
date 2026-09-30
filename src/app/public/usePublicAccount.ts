import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { directApiBackend } from '../../api/directApiBackend';
import type { AuthAccount } from '../../api/authBackend';

// Consumed through @app by the Build portal; nothing inside this repo
// imports it.

export interface UsePublicAccountResult {
  /** undefined while the initial silent-refresh load is in flight. */
  account: AuthAccount | null | undefined;
  refresh: () => Promise<void>;
}

// Public web has no local service to hold a session across page loads, so the
// account is re-derived from DirectApiBackend's silent refresh once per page
// load. Every caller shares that one copy: the header and the page body must
// agree, so a sign-in or sign-out that refreshes through one reaches all.
let current: AuthAccount | null | undefined;
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

  return { account, refresh };
}
