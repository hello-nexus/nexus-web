import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getStreamDeckConfig, setStreamDeckConfig, type StreamDeckSummary } from '../../../api/streamdeck';
import { computeViewUploadJobs, makePhysicalDeckTarget, slotCountAtDepth, type DeckTarget } from './deckTarget';
import { transformForModel } from './deckKeyTransform';
import { pushDeckKeyImages } from './physicalDeckSync';
import { emptyDeck, resolveViewSlots } from './deckLayout';
import type { DeckConfig } from './types';

export interface UsePhysicalDeckTargetResult {
  target: DeckTarget | null;
  loaded: boolean;
  /** Deep-replaces the whole config tree (copy-widget-layout) and re-renders the current view. */
  replaceAll: (next: DeckConfig) => void;
}

/**
 * Fetches + owns a physical deck's DeckConfig and keeps its hardware key
 * images in sync: every time the config or the editor's current folder path
 * changes, the whole current view is re-rendered and re-uploaded (Back-key
 * reservation included), so a folder the editor navigates into is always
 * fully pre-rendered. Pass `deck: null` to disable (no fetch, no target).
 */
export function usePhysicalDeckTarget(
  deck: StreamDeckSummary | null,
  folderPath: readonly number[],
): UsePhysicalDeckTargetResult {
  const [config, setConfig] = useState<DeckConfig | null>(null);
  const serial = deck?.serial ?? null;

  useEffect(() => {
    setConfig(null);
    if (!serial) return;
    let cancelled = false;
    void getStreamDeckConfig(serial).then(cfg => {
      if (!cancelled) setConfig(cfg ?? emptyDeck());
    });
    return () => { cancelled = true; };
  }, [serial]);

  const persist = useCallback((next: DeckConfig) => {
    setConfig(next);
    if (serial) void setStreamDeckConfig(serial, next);
  }, [serial]);

  const target = useMemo<DeckTarget | null>(() => {
    if (!deck || !config) return null;
    return makePhysicalDeckTarget(deck.cols, deck.rows, deck.keyCount, config, persist);
  }, [deck, config, persist]);

  const generationRef = useRef(0);
  const folderKey = folderPath.join('.');
  useEffect(() => {
    if (!deck || !config) return;
    const generation = ++generationRef.current;
    const countFn = (depth: number) => slotCountAtDepth({ kind: 'physical', keyCount: deck.keyCount }, depth);
    const slots = resolveViewSlots(config, folderPath, countFn);
    if (!slots) return;
    const jobs = computeViewUploadJobs(slots, folderPath);
    const model = { keyPixels: deck.keyPixels, format: deck.format, transform: transformForModel(deck.model) };
    void pushDeckKeyImages(deck.serial, model, jobs, () => generationRef.current !== generation);
    // deck's identity churns on every 'streamdeck' topic frame (press events,
    // other decks' brightness, ...) - keying on its scalar fields (not the
    // object) keeps this effect from re-pushing images on unrelated updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck?.serial, deck?.cols, deck?.rows, deck?.keyCount, deck?.model, deck?.format, deck?.keyPixels, config, folderKey]);

  const replaceAll = useCallback((next: DeckConfig) => { persist(next); }, [persist]);

  return { target, loaded: config !== null, replaceAll };
}
