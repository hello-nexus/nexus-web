import { useEffect, useMemo, useState } from 'react';
import { BuildPage, type HeadlessBuild } from '../../../components/views/BuildPage/BuildPage';
import { useBuildMachine } from '../../../components/views/BuildPage/buildMachine';
import { clearSeedFailures, recordSeedFailure, seedAttemptKey, seedFailedRecently } from './seedAttempts';

/** Past this the try counts as failed. */
export const SEED_TIMEOUT_MS = 60_000;

// A failed case is not retried within the page, so an image that never lands cannot loop.
const tried = new Set<string>();
// One frame at a time however many tiles exist.
let owner: symbol | null = null;
const waiters = new Set<() => void>();
const release = (id: symbol) => {
  if (owner !== id) return;
  owner = null;
  waiters.forEach(wake => wake());
};

/** Test seam. */
export function resetPreviewSeed(): void {
  tried.clear();
  clearSeedFailures();
  owner = null;
  waiters.clear();
}

/** Frames Build out of sight so it renders and stores the case image; the tile unmounts this once the image lands. */
export function BuildPreviewSeed({ caseId }: { caseId: string }) {
  const [id] = useState(() => Symbol('build-preview-seed'));
  const [active, setActive] = useState(false);
  const [stopped, setStopped] = useState(() => tried.has(caseId));
  const { machine, key } = useBuildMachine(!stopped);
  const attempt = key === null ? null : seedAttemptKey(caseId, key);

  // A failure kept from an earlier launch holds this one off, so an offline or failing portal is not framed on every start.
  useEffect(() => {
    if (attempt !== null && seedFailedRecently(attempt)) {
      tried.add(caseId);
      setStopped(true);
    }
  }, [attempt, caseId]);

  const [wake, setWake] = useState(0);
  useEffect(() => {
    if (stopped) return undefined;
    if (owner !== null) {
      const again = () => setWake(n => n + 1);
      waiters.add(again);
      return () => { waiters.delete(again); };
    }
    owner = id;
    setActive(true);
    return () => {
      setActive(false);
      release(id);
    };
  }, [stopped, id, wake]);

  // A failure kept from an earlier launch keeps the frame from mounting at all, not only from staying.
  const heldOff = attempt !== null && seedFailedRecently(attempt);
  const ready = active && !stopped && !heldOff && machine !== null && key !== null && machine.caseId === caseId;

  useEffect(() => {
    if (!ready) return undefined;
    const timer = window.setTimeout(() => {
      tried.add(caseId);
      if (attempt !== null) recordSeedFailure(attempt);
      setStopped(true);
    }, SEED_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [ready, caseId, attempt]);

  const headless = useMemo<HeadlessBuild | null>(() => (ready && machine && key !== null
    ? {
      machine,
      layoutKey: key,
      preview: true,
      onResolved: () => {},
      onUnavailable: () => {
        tried.add(caseId);
        if (attempt !== null) recordSeedFailure(attempt);
        setStopped(true);
      },
    }
    : null), [ready, machine, key, caseId, attempt]);

  return headless ? <BuildPage headless={headless} /> : null;
}

export default BuildPreviewSeed;
