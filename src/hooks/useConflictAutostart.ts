import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  disableConflictAutostart,
  fetchConflictAutostart,
  type ConflictAutostartEntry,
  type DetectedConflict,
} from '../api/conflicts';

/** What still launches an app at boot, keyed by catalog id. An app absent from the map has no verified recipe, so no action is offered for it. */
export type ConflictAutostartMap = ReadonlyMap<string, readonly ConflictAutostartEntry[]>;

export interface ConflictAutostartState {
  autostartByApp: ConflictAutostartMap;
  /** Disables everything still starting the app at boot. Resolves true only when the service verified every entry disabled. */
  disable: (conflictId: string) => Promise<boolean>;
}

function toMap(
  apps: readonly { id: string; entries?: ConflictAutostartEntry[] }[],
): ConflictAutostartMap {
  const map = new Map<string, readonly ConflictAutostartEntry[]>();
  for (const app of apps) map.set(app.id, app.entries ?? []);
  return map;
}

/**
 * Boot-entry state for the conflict surfaces. Read when the surface opens and
 * again whenever the detected set changes - the service only reports apps it
 * currently detects, so an app that starts while the modal is open would
 * otherwise never get the action. Not polled: boot entries only move when this
 * action, the vendor's app, or Task Manager moves them, and the read walks the
 * registry and a vendor config file.
 */
export function useConflictAutostart(
  conflicts: readonly DetectedConflict[],
  enabled: boolean,
): ConflictAutostartState {
  const [byApp, setByApp] = useState<ConflictAutostartMap>(() => new Map());
  const mountedRef = useRef(true);
  // Two reads can be in flight at once - a detected-set change racing the
  // re-read after a disable. Without a sequence guard the slower one can land
  // last and put the button back on an app that was just verified disabled.
  const requestRef = useRef(0);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Re-read on a change of WHICH apps are detected, not on every frame the
  // watcher pushes - a pid change is not a boot-entry change.
  const detectedKey = useMemo(
    () => conflicts.map(c => c.id).sort().join(','),
    [conflicts],
  );

  const refresh = useCallback(async () => {
    const seq = ++requestRef.current;
    const apps = await fetchConflictAutostart().catch(() => null);
    if (!mountedRef.current || seq !== requestRef.current) return;
    // A failed read leaves what we already know in place. Wiping it would pull
    // the action off every other row at once with nothing said; only the very
    // first read starts from empty, which fails closed.
    if (apps) setByApp(toMap(apps));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, detectedKey, refresh]);

  const disable = useCallback(async (conflictId: string) => {
    const res = await disableConflictAutostart(conflictId).catch(() => null);
    // Re-read either way: a partial success has to leave the remaining entries
    // on screen rather than reporting the app handled.
    await refresh();
    return res !== null && !res.error;
  }, [refresh]);

  return { autostartByApp: byApp, disable };
}
