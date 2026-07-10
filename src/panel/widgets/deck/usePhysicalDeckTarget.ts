import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getStreamDeckConfig, setStreamDeckConfig, uploadStreamDeckKeyImage, type StreamDeckSummary } from '../../../api/streamdeck';
import { computeViewUploadJobs, makePhysicalDeckTarget, slotCountAtDepth, type DeckTarget } from './deckTarget';
import { resolveDeckKeyTransform } from './deckKeyTransform';
import { pushDeckKeyImages } from './physicalDeckSync';
import { renderDeckBackKeyBitmap, type DeckKeyModel } from './renderDeckKeyBitmap';
import { resolveViewSlots } from './deckLayout';
import type { DeckConfig } from './types';

const SYNC_DEBOUNCE_MS = 300;

function deckKeyModel(deck: StreamDeckSummary): DeckKeyModel {
  return { keyPixels: deck.keyPixels, format: deck.format, transform: resolveDeckKeyTransform(deck.model, deck.transform) };
}

export interface UsePhysicalDeckTargetResult {
  target: DeckTarget | null;
  loaded: boolean;
  /** True once the initial config fetch has settled with a failure. target stays null (no editing) until retry() succeeds. */
  error: boolean;
  retry: () => void;
  /** Deep-replaces the whole config tree (copy-widget-layout) and re-renders the current view. */
  replaceAll: (next: DeckConfig) => void;
}

/**
 * Fetches + owns a physical deck's DeckConfig and keeps its hardware key
 * images in sync. fetchService returns null for a transport failure the
 * same as it would for an absent resource, so a failed GET sets `error`
 * instead of falling back to an empty editable config - PUTting an empty
 * config over the deck's real stored layout on the user's first edit would
 * otherwise be silent data loss. Pass `deck: null` to disable (no fetch, no
 * target).
 */
export function usePhysicalDeckTarget(
  deck: StreamDeckSummary | null,
  folderPath: readonly number[],
): UsePhysicalDeckTargetResult {
  const [config, setConfig] = useState<DeckConfig | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const serial = deck?.serial ?? null;
  // Which serial `config` belongs to, so a stale in-flight GET for a serial
  // the user has since switched away from can never overwrite (or schedule a
  // sync against) the newly active deck - see the sync effect's guard below.
  const configSerialRef = useRef<string | null>(null);
  const backUploadOkRef = useRef(false);

  useEffect(() => {
    setConfig(null);
    setLoadError(false);
    configSerialRef.current = null;
    backUploadOkRef.current = false;
    if (!serial) return;
    let cancelled = false;
    void getStreamDeckConfig(serial).then(cfg => {
      if (cancelled) return;
      if (cfg) {
        configSerialRef.current = serial;
        setConfig(cfg);
      } else {
        setLoadError(true);
      }
    });
    return () => { cancelled = true; };
  }, [serial, retryToken]);

  const retry = useCallback(() => setRetryToken(t => t + 1), []);

  const persist = useCallback((next: DeckConfig) => {
    setConfig(next);
  }, []);

  const target = useMemo<DeckTarget | null>(() => {
    if (!deck || !config || loadError) return null;
    return makePhysicalDeckTarget(deck.cols, deck.rows, deck.keyCount, config, persist);
  }, [deck, config, loadError, persist]);

  // Debounced network sync: a PUT of the config plus a re-render/upload of
  // the current view's key images, ~300ms after the last edit (typing a
  // label otherwise fires this on every keystroke, flickering hardware). A
  // failed PUT rolls the local state back to the server's last-known value
  // so local and server state can't silently diverge - a physical press
  // would otherwise run a binding the server never actually saved. The
  // once-per-deck back-key upload retries on every sync pass until it lands.
  const pendingRef = useRef<{ timer: ReturnType<typeof setTimeout>; run: () => void; serial: string } | null>(null);
  const generationRef = useRef(0);
  const folderKey = folderPath.join('.');

  const flushPending = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingRef.current = null;
    pending.run();
  }, []);

  useEffect(() => {
    if (pendingRef.current && pendingRef.current.serial !== serial) flushPending();
  }, [serial, flushPending]);

  useEffect(() => {
    if (!deck || !config || loadError || deck.serial !== configSerialRef.current) return;

    if (pendingRef.current) {
      clearTimeout(pendingRef.current.timer);
      pendingRef.current = null;
    }

    const runSync = () => {
      const generation = ++generationRef.current;
      const isStale = () => generationRef.current !== generation;

      void setStreamDeckConfig(deck.serial, config).then(ok => {
        if (ok || isStale()) return;
        void getStreamDeckConfig(deck.serial).then(cfg => {
          if (!isStale() && cfg) setConfig(cfg);
        });
      });

      const countFn = (depth: number) => slotCountAtDepth({ kind: 'physical', keyCount: deck.keyCount }, depth);
      const slots = resolveViewSlots(config, folderPath, countFn);
      const model = deckKeyModel(deck);
      if (slots) {
        const jobs = computeViewUploadJobs(slots, folderPath);
        void pushDeckKeyImages(deck.serial, model, jobs, isStale);
      }
      if (!backUploadOkRef.current) {
        void renderDeckBackKeyBitmap(model)
          .then(bytes => uploadStreamDeckKeyImage(deck.serial, 'back', 0, bytes, model.format))
          .then(hash => { if (hash !== null && !isStale()) backUploadOkRef.current = true; });
      }
    };

    const timer = setTimeout(() => { pendingRef.current = null; runSync(); }, SYNC_DEBOUNCE_MS);
    pendingRef.current = { timer, run: runSync, serial: deck.serial };
    // deck's identity churns on every 'streamdeck' topic frame (press events,
    // other decks' brightness, ...) - keying on its scalar fields (not the
    // object) keeps this effect from re-scheduling on unrelated updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck?.serial, deck?.cols, deck?.rows, deck?.keyCount, deck?.model, deck?.format, deck?.keyPixels, deck?.transform, config, loadError, folderKey]);

  useEffect(() => flushPending, [flushPending]);

  const replaceAll = useCallback((next: DeckConfig) => { setConfig(next); }, []);

  return { target, loaded: config !== null || loadError, error: loadError, retry, replaceAll };
}
