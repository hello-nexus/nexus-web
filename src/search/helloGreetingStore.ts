import { useEffect, useState } from 'react';
import { fetchService } from '../api/service';
import { HELLO_FIRST_KEY, randomHelloPoolKey } from './helloGreetings';

const GREETED_BOOT_KEY = 'nexus.helloGreetedBoot';

interface BootResponse {
  bootId: string;
}

export interface PendingGreeting {
  textKey: string;
  // Bumped on every assignment so a repeated random pick (checkOnce or a
  // devtools replay) still forces the animation to remount.
  id: number;
}

let pending: PendingGreeting | null = null;
let nextId = 1;
let checkedThisSession = false;
let checkInFlight = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

function setPending(textKey: string): void {
  pending = { textKey, id: nextId++ };
  notify();
}

export function subscribeHelloGreeting(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getPendingHelloGreeting(): PendingGreeting | null {
  return pending;
}

export function useHelloGreetingPending(): PendingGreeting | null {
  const [state, setState] = useState(getPendingHelloGreeting);
  useEffect(() => subscribeHelloGreeting(() => setState(getPendingHelloGreeting())), []);
  return state;
}

/** Called on any disruption (search opened, typed into, or the page changed). */
export function dismissHelloGreeting(): void {
  if (pending === null) return;
  pending = null;
  notify();
}

/** Dev-tools preview: show a random line right now, independent of boot id. */
export function playHelloGreeting(): void {
  setPending(randomHelloPoolKey());
}

/** Dev-tools reset: the next check greets again as if this were a fresh boot. */
export function resetHelloGreetedBoot(): void {
  try {
    localStorage.removeItem(GREETED_BOOT_KEY);
  } catch {
    /* storage unavailable */
  }
  checkedThisSession = false;
}

/**
 * Runs at most once per dashboard session. Compares the service's current boot
 * id against the last one greeted; a mismatch (or no stored value at all) queues
 * a greeting and persists the new boot id. checkedThisSession is set only after
 * a successful fetch, so a transient service outage at the first online
 * transition does not consume the session's single attempt; checkInFlight guards
 * against a concurrent second run.
 */
export async function checkHelloGreetingOnce(): Promise<void> {
  if (checkedThisSession || checkInFlight) return;
  checkInFlight = true;
  try {
    let res: BootResponse | null;
    try {
      res = await fetchService<BootResponse>('/system/boot');
    } catch {
      return;
    }
    checkedThisSession = true;
    if (!res?.bootId) return;

    let stored: string | null;
    try {
      stored = localStorage.getItem(GREETED_BOOT_KEY);
    } catch {
      return;
    }
    if (stored === res.bootId) return;

    setPending(stored === null ? HELLO_FIRST_KEY : randomHelloPoolKey());

    try {
      localStorage.setItem(GREETED_BOOT_KEY, res.bootId);
    } catch {
      /* best effort; a repeat greeting next load is an acceptable fallback */
    }
  } finally {
    checkInFlight = false;
  }
}
