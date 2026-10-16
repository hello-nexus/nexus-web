import { useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import { fetchPanelDevice, patchPanelDevice } from '../api/panel';
import { usePanelDeviceId } from '../panel/widgets/common/PanelDeviceIdContext';
import { usePersistentIdSet } from './usePersistentState';

/** The panel record fields that hold a remembered selection. */
export type PanelSelectionField = 'lightingSelection' | 'coolingSelection';

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  a.size === b.size && [...a].every(id => b.has(id));

function listedIds(set: ReadonlySet<string>, valid?: ReadonlySet<string> | null): ReadonlySet<string> {
  if (!valid || valid.size === 0) return set;
  const kept = new Set([...set].filter(id => valid.has(id)));
  return sameSet(kept, set) ? set : kept;
}

// Outside a real panel (desktop dashboard embed, previews) the immersive selection still gets its
// own key: it must never share state with the desktop Lighting or Cooling page.
const UNPANELED_SUFFIX = 'immersive';

/**
 * usePersistentIdSet for an immersive view. Its selection is never the desktop page's: it is keyed
 * by the panel's device id (a fixed suffix outside a panel) and, inside a real panel, mirrored to
 * that panel's service record. The record wins once fetched, unless the user changed the selection
 * first. `validIds` (once non-empty) hides remembered ids that are not listed right now; the
 * stored set is never pruned, because a device list that is still filling in (boot, rescan,
 * hot-plug) would otherwise shrink the remembered selection for good.
 */
export function usePanelIdSet(
  desktopKey: string,
  field: PanelSelectionField,
  validIds?: ReadonlySet<string> | null,
): [Set<string>, Dispatch<SetStateAction<Set<string>>>] {
  const panelId = usePanelDeviceId();
  const [value, setLocal] = usePersistentIdSet(`${desktopKey}.${panelId ?? UNPANELED_SUFFIX}`);
  const latest = useRef(value);
  latest.current = value;
  const touched = useRef(false);
  const writes = useRef<Promise<unknown>>(Promise.resolve());

  const write = useCallback((next: Set<string>) => {
    if (!panelId) return;
    writes.current = writes.current
      .then(() => patchPanelDevice(panelId, { [field]: [...next] }))
      .catch(() => {});
  }, [panelId, field]);

  useEffect(() => {
    if (!panelId) return;
    let live = true;
    void fetchPanelDevice(panelId).then(record => {
      const remote = record?.[field];
      if (!live || touched.current || !Array.isArray(remote)) return;
      const next = new Set(remote);
      if (sameSet(next, latest.current)) return;
      latest.current = next;
      setLocal(next);
    }).catch(() => { /* the local copy stands */ });
    return () => { live = false; };
  }, [panelId, field, setLocal]);

  const validRef = useRef(validIds);
  validRef.current = validIds;
  const shown = useMemo(() => listedIds(value, validIds), [value, validIds]);

  // Edits act on the listed ids and keep the stored ones that are not listed right now.
  const setValue = useCallback<Dispatch<SetStateAction<Set<string>>>>(next => {
    const base = new Set(listedIds(latest.current, validRef.current));
    const resolved = typeof next === 'function' ? next(base) : next;
    if (sameSet(resolved, base)) return;
    const full = new Set([...resolved, ...[...latest.current].filter(id => !base.has(id))]);
    touched.current = true;
    latest.current = full;
    setLocal(full);
    write(full);
  }, [setLocal, write]);

  return [shown as Set<string>, setValue];
}
