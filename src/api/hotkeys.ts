// Client for the global hotkey routes. Desktop token only. The `hotkeys` multiplex
// topic carries the same shape as GET /hotkeys on every change.
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { authFetchWithStatus, fetchService } from './service';
import { useTopicCallback } from '../hooks/useMultiplexSocket';
import type { DeckAction } from '../panel/widgets/deck/types';

export const HOTKEYS_TOPIC = 'hotkeys';

export type HotkeyPlatform = 'macos' | 'windows' | 'linux';

export type HotkeyStatus = 'active' | 'disabled' | 'unbound' | 'conflict' | 'orphaned' | 'unsupported';

export type HotkeyDialEvent = 'push' | 'turnLeft' | 'turnRight' | 'touch';

export type HotkeyTarget =
  | { kind: 'action'; action: DeckAction }
  // `tag` is the binding id, stored on the key or dial event inside the preset.
  | { kind: 'deck'; presetId: string; tag: string };

/** What a PUT carries. `combo` is always present (null = unbound). */
export interface HotkeyBindingInput {
  id: string;
  combo: string | null;
  enabled: boolean;
  label?: string;
  target: HotkeyTarget;
}

export interface HotkeyBinding extends HotkeyBindingInput {
  status: HotkeyStatus;
}

export interface HotkeysState {
  supported: boolean;
  platform: HotkeyPlatform;
  suspended: boolean;
  bindings: HotkeyBinding[];
}

export type HotkeysResult =
  | { ok: true; state: HotkeysState }
  | { ok: false; msg: string; code?: string };

function isHotkeysState(v: unknown): v is HotkeysState {
  return !!v && typeof v === 'object' && Array.isArray((v as HotkeysState).bindings);
}

export async function getHotkeys(): Promise<HotkeysState | null> {
  const res = await fetchService<HotkeysState>('/hotkeys');
  return isHotkeysState(res) ? res : null;
}

// authFetch collapses a non-2xx to null; the PUT's 400 carries the reason, so keep the status.
async function send(method: 'PUT' | 'DELETE' | 'POST', path: string, body?: unknown): Promise<HotkeysResult> {
  const { response, status } = await authFetchWithStatus(path, { method, body });
  if (!response) return { ok: false, msg: '' };
  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  if (status >= 200 && status < 300 && isHotkeysState(json)) return { ok: true, state: json };
  const failure = json as { msg?: string; code?: string } | null;
  return { ok: false, msg: failure?.msg ?? '', code: failure?.code };
}

export const putHotkey = (binding: HotkeyBindingInput) =>
  send('PUT', `/hotkeys/${encodeURIComponent(binding.id)}`, binding);

export const deleteHotkey = (id: string) =>
  send('DELETE', `/hotkeys/${encodeURIComponent(id)}`);

export const resetHotkeyDefaults = () => send('POST', '/hotkeys/reset-defaults', {});

/** Unregisters (true) or re-registers (false) every OS hotkey. The service resumes on its own after a while without a repeat of true. */
// Calls run one after another, so a resume can never overtake the suspend before it.
let suspendChain: Promise<unknown> = Promise.resolve();
export function setHotkeysSuspended(suspended: boolean): Promise<HotkeysResult> {
  const run = suspendChain.then(() => send('POST', '/hotkeys/suspend', { suspended }));
  suspendChain = run.catch(() => undefined);
  return run;
}


/** New id for a user-created binding, within the id alphabet and length the service accepts. */
export function newHotkeyId(): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return `custom:${rand}`;
}

export interface UseHotkeysResult {
  state: HotkeysState | null;
  loaded: boolean;
  /** Adopts the state a successful mutation returned, ahead of the topic frame. */
  apply: (next: HotkeysState) => void;
}

// One copy of the state for every mounted consumer, so each deck hotkey field
// does not run its own GET. It is cleared when the last consumer unmounts, so a
// later mount starts from a fresh GET.
const store = { state: null as HotkeysState | null, loaded: false, fresh: false, users: 0, inflight: false, epoch: 0 };
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// A topic frame or mutation result is newer than a GET still in flight.
function publish(next: HotkeysState): void {
  store.fresh = true;
  if (store.state === next) return;
  store.state = next;
  listeners.forEach(l => l());
}

function load(): void {
  const epoch = store.epoch;
  store.inflight = true;
  void getHotkeys().then(res => {
    if (epoch !== store.epoch) return;
    store.inflight = false;
    if (res && !store.fresh) store.state = res;
    store.loaded = true;
    listeners.forEach(l => l());
  });
}

/** GET /hotkeys once for all consumers, then every `hotkeys` topic frame replaces the state. */
export function useHotkeys(enabled: boolean): UseHotkeysResult {
  const state = useSyncExternalStore(subscribe, () => store.state);
  const loaded = useSyncExternalStore(subscribe, () => store.loaded);

  useEffect(() => {
    if (!enabled) return;
    store.users += 1;
    if (!store.state && !store.inflight) load();
    return () => {
      store.users -= 1;
      if (store.users === 0) {
        store.epoch += 1;
        Object.assign(store, { state: null, loaded: false, fresh: false, inflight: false });
      }
    };
  }, [enabled]);

  const onFrame = useCallback((data: unknown) => {
    if (isHotkeysState(data)) publish(data);
  }, []);
  useTopicCallback(HOTKEYS_TOPIC, enabled, onFrame);

  return { state: enabled ? state : null, loaded: enabled && loaded, apply: publish };
}
