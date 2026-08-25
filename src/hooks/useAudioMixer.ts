import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyMixerPreset,
  clearMixerLevels,
  deleteMixerPreset,
  fetchAudioMixer,
  renameMixerPreset,
  saveMixerPreset,
  setMixerSticky,
  setSessionMuted,
  setSessionVolume,
  type AudioMixerFrame,
  type AudioMixerPreset,
  type AudioMixerState,
  type AudioSession,
  type SaveMixerPresetBody,
} from '../api/mixer';
import { useTopic } from './useMultiplexSocket';

// Mid-drag writes are coalesced to this cadence: the finger moves continuously,
// the service only needs the latest target.
const LIVE_WRITE_INTERVAL_MS = 80;
// How long a local value outranks incoming frames after the finger lifts. The
// round trip is service -> helper -> Core Audio -> snapshot, so a frame sampled
// mid-flight still carries the old level and would snap the slider back.
const SETTLE_MS = 900;

export interface MixerController {
  supported: boolean;
  sessions: AudioSession[];
  stickyLevels: boolean;
  presets: AudioMixerPreset[];
  /** Mid-drag: moves the level, remembers nothing. */
  changeVolume: (id: string, volume: number) => void;
  /** Finger up: the value the user settled on, and the one worth remembering. */
  commitVolume: (id: string, volume: number) => void;
  toggleMuted: (id: string, muted: boolean) => void;
  setSticky: (enabled: boolean) => void;
  clearLevels: () => void;
  /** False when the service refused the write (cap, duplicate, transport). */
  savePreset: (body: SaveMixerPresetBody) => Promise<boolean>;
  renamePreset: (id: string, name: string) => Promise<void>;
  deletePreset: (id: string) => Promise<void>;
  applyPreset: (id: string) => Promise<void>;
}

interface Override {
  volume?: number;
  muted?: boolean;
}

/**
 * Per-app mixer state. Subscribing to the `audio/mixer` topic is also what
 * turns on meter-rate sampling in the service, so a mounted-but-disabled
 * mixer costs nothing.
 */
export function useAudioMixer(enabled: boolean, onConfigChanged?: () => void): MixerController {
  const [state, setState] = useState<AudioMixerState | null>(null);
  const frame = useTopic<AudioMixerFrame>('audio/mixer', enabled);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const revisionRef = useRef(-1);
  const pendingRef = useRef(new Map<string, number>());
  const inflightRef = useRef(new Set<string>());
  const lastSentAtRef = useRef(new Map<string, number>());
  const settleTimersRef = useRef(new Map<string, number>());
  const pumpRef = useRef<(id: string) => void>(() => {});

  const refetch = useCallback(async () => {
    const next = await fetchAudioMixer();
    if (next) setState(next);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    refetch();
  }, [enabled, refetch]);

  // Presets, the sticky flag and the default endpoints do not ride the
  // meter-rate frame; the revision is the signal that one of them moved.
  const configChangedRef = useRef(onConfigChanged);
  useEffect(() => { configChangedRef.current = onConfigChanged; }, [onConfigChanged]);
  useEffect(() => {
    if (!frame) return;
    if (frame.configRevision === revisionRef.current) return;
    const first = revisionRef.current < 0;
    revisionRef.current = frame.configRevision;
    if (first) return;
    refetch();
    configChangedRef.current?.();
  }, [frame, refetch]);

  const pump = useCallback((id: string) => {
    if (inflightRef.current.has(id)) return;
    const next = pendingRef.current.get(id);
    if (next === undefined) return;

    const elapsed = Date.now() - (lastSentAtRef.current.get(id) ?? 0);
    if (elapsed < LIVE_WRITE_INTERVAL_MS) {
      window.setTimeout(() => pumpRef.current(id), LIVE_WRITE_INTERVAL_MS - elapsed);
      return;
    }

    pendingRef.current.delete(id);
    inflightRef.current.add(id);
    lastSentAtRef.current.set(id, Date.now());
    setSessionVolume(id, next, false).finally(() => {
      inflightRef.current.delete(id);
      pumpRef.current(id);
    });
  }, []);
  useEffect(() => { pumpRef.current = pump; }, [pump]);

  const holdOverride = useCallback((id: string, patch: Override) => {
    setOverrides(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    const timers = settleTimersRef.current;
    const running = timers.get(id);
    if (running !== undefined) window.clearTimeout(running);
    timers.set(id, window.setTimeout(() => {
      timers.delete(id);
      setOverrides(prev => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }, SETTLE_MS));
  }, []);

  useEffect(() => {
    const timers = settleTimersRef.current;
    return () => {
      for (const handle of timers.values()) window.clearTimeout(handle);
      timers.clear();
    };
  }, []);

  const changeVolume = useCallback((id: string, volume: number) => {
    holdOverride(id, { volume });
    pendingRef.current.set(id, volume);
    pumpRef.current(id);
  }, [holdOverride]);

  const commitVolume = useCallback((id: string, volume: number) => {
    holdOverride(id, { volume });
    // The final value must not sit behind a coalescing delay, and it is the one
    // the service persists - drop any queued mid-drag frame for this strip.
    pendingRef.current.delete(id);
    setSessionVolume(id, volume, true);
  }, [holdOverride]);

  const toggleMuted = useCallback((id: string, muted: boolean) => {
    holdOverride(id, { muted });
    setSessionMuted(id, muted);
  }, [holdOverride]);

  const setSticky = useCallback((next: boolean) => {
    setState(prev => (prev ? { ...prev, stickyLevels: next } : prev));
    setMixerSticky(next);
  }, []);

  const clearLevels = useCallback(() => { clearMixerLevels(); }, []);

  const savePreset = useCallback(async (body: SaveMixerPresetBody) => {
    const saved = await saveMixerPreset(body);
    await refetch();
    return saved !== null;
  }, [refetch]);

  const renamePreset = useCallback(async (id: string, name: string) => {
    await renameMixerPreset(id, name);
    await refetch();
  }, [refetch]);

  const deletePreset = useCallback(async (id: string) => {
    await deleteMixerPreset(id);
    await refetch();
  }, [refetch]);

  const applyPreset = useCallback(async (id: string) => {
    await applyMixerPreset(id);
    await refetch();
  }, [refetch]);

  const rawSessions = frame?.sessions ?? state?.sessions ?? [];
  const sessions = rawSessions.map(s => {
    const held = overrides[s.id];
    if (!held) return s;
    return {
      ...s,
      volume: held.volume ?? s.volume,
      muted: held.muted ?? s.muted,
    };
  });

  return {
    supported: frame?.supported ?? state?.supported ?? false,
    sessions,
    stickyLevels: state?.stickyLevels ?? true,
    presets: state?.presets ?? [],
    changeVolume,
    commitVolume,
    toggleMuted,
    setSticky,
    clearLevels,
    savePreset,
    renamePreset,
    deletePreset,
    applyPreset,
  };
}
