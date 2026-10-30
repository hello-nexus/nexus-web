import { useEffect, useMemo, useState } from 'react';
import { BuildPage, type HeadlessBuild } from '../../../components/views/BuildPage/BuildPage';
import { useBuildMachine } from '../../../components/views/BuildPage/buildMachine';

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
  owner = null;
  waiters.clear();
}

/** Frames Build out of sight so it renders and stores the case image; the tile unmounts this once the image lands. */
export function BuildPreviewSeed({ caseId }: { caseId: string }) {
  const [id] = useState(() => Symbol('build-preview-seed'));
  const [active, setActive] = useState(false);
  const [stopped, setStopped] = useState(() => tried.has(caseId));
  const { machine, key } = useBuildMachine(!stopped);

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

  const ready = active && !stopped && machine !== null && key !== null && machine.caseId === caseId;

  useEffect(() => {
    if (!ready) return undefined;
    const timer = window.setTimeout(() => {
      tried.add(caseId);
      setStopped(true);
    }, SEED_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [ready, caseId]);

  const headless = useMemo<HeadlessBuild | null>(() => (ready && machine && key !== null
    ? {
      machine,
      layoutKey: key,
      preview: true,
      onResolved: () => {},
      onUnavailable: () => {
        tried.add(caseId);
        setStopped(true);
      },
    }
    : null), [ready, machine, key, caseId]);

  return headless ? <BuildPage headless={headless} /> : null;
}

export default BuildPreviewSeed;
