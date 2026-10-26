import type { PcSetupRecord } from '../../api/pcSetup';
import type { BuildResolved } from '../../components/views/BuildPage/BuildPage';
import { supportsAirflow } from './airflowCases';

/** The layout keys already tried this session, so a layout that stays out of date after a try is never retried in a loop. */
const tried = new Set<string>();

export const hasTried = (key: string): boolean => tried.has(key);
export const markTried = (key: string): void => {
  tried.add(key);
  if (namesGpu(key)) writeGpuTried(key);
};
export const forgetTried = (key: string): void => { tried.delete(key); };
/** Test seam. */
export const resetTried = (): void => {
  tried.clear();
  writeGpuTried(null);
};

/**
 * The last key tried that named a card, kept across page loads: a card that never resolves to a catalog part leaves the layout without a
 * card box for good, and without this the card clause below would run the hidden Build again on every load.
 */
const GPU_TRIED_STORAGE_KEY = 'nexus.cooling.gpuResolveTried';
const readGpuTried = (): string | null => {
  try { return window.localStorage.getItem(GPU_TRIED_STORAGE_KEY); } catch { return null; }
};
const writeGpuTried = (key: string | null): void => {
  try {
    if (key === null) window.localStorage.removeItem(GPU_TRIED_STORAGE_KEY);
    else window.localStorage.setItem(GPU_TRIED_STORAGE_KEY, key);
  } catch { /* storage unavailable: the in-memory set still stops a loop within the page */ }
};

const layoutOf = (record: PcSetupRecord): { caseModel?: unknown; inputKey?: unknown } | null => {
  const layout = record.setup.resolved?.caseLayout;
  return layout && typeof layout === 'object' ? (layout as { caseModel?: unknown; inputKey?: unknown }) : null;
};

/**
 * Whether Build has to resolve this PC's layout again: it has not yet (the record holds none), or it did for other inputs (the case, board,
 * memory, processor, card, or the coolers and fans detected changed since), or it draws no card though the PC has one: Build may place the
 * card only once its catalog or its layout learns it, and the same key then gives a different layout; that clause fires once per key, across loads. A PC with no case known has nothing to lay out.
 */
export function layoutNeedsResolve(record: PcSetupRecord | null, key: string | null, caseId: string | undefined): boolean {
  if (!record || !key || !caseId) return false;
  const layout = layoutOf(record);
  return !layout || layout.inputKey !== key || (namesGpu(key) && !holdsGpu(layout) && readGpuTried() !== key);
}

/** The key names a graphics card (its `gpu=` part is not empty). */
const namesGpu = (key: string): boolean => key.split('|').some(part => part.startsWith('gpu=') && part.length > 'gpu='.length);

/** The layout draws a graphics card box. */
const holdsGpu = (layout: object): boolean => {
  const boxes = (layout as { boxes?: unknown }).boxes;
  return Array.isArray(boxes) && boxes.some(b => !!b && typeof b === 'object' && (b as { slot?: unknown; role?: unknown }).slot === 'gpu' && (b as { role?: unknown }).role === 'part');
};

export type ResolveOutcome = 'waiting' | 'done' | 'failed';

/**
 * Where a headless resolve stands, from its latest message and the record Cooling holds. A layout the view cannot draw is done as soon as
 * it is saved; a drawable one waits for the case model too, which lands a moment after the layout.
 */
export function resolveOutcome(message: BuildResolved | null, record: PcSetupRecord | null): ResolveOutcome {
  if (!message) return 'waiting';
  if (!message.saved) return 'failed';
  if (!message.hasLayout) return 'done';
  if (!record || record.rev < message.rev) return 'waiting';
  return message.model || !supportsAirflow(layoutOf(record)?.caseModel as string | undefined) ? 'done' : 'waiting';
}
