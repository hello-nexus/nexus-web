import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchService, postService } from '../api/service';
import { useTopic } from './useMultiplexSocket';

export interface SystemVolumeState {
  supported: boolean;
  volume: number;
  muted: boolean;
}

const DEFAULT_STATE: SystemVolumeState = { supported: false, volume: 0, muted: false };
const LIVE_VOLUME_WRITE_INTERVAL_MS = 80;

export interface CommitVolumeOptions {
  flush?: boolean;
}

/**
 * System default-render audio volume + mute. Subscribes to the multiplexed
 * "volume" WebSocket topic for live push (server broadcasts on every change),
 * and falls back to HTTP polling so the initial state populates and updates
 * survive a WS disconnect. Volume writes are live-coalesced during slider drag:
 * the UI updates immediately, the service gets the latest value at a short
 * interval, and pointer-up flushes the final value.
 */
export function useSystemVolume(enabled: boolean, pollMs = 1000) {
  const [state, setState] = useState<SystemVolumeState>(DEFAULT_STATE);
  const localOverrideUntil = useRef(0);
  const mounted = useRef(true);
  const volumeWrite = useRef<{
    inFlight: boolean;
    lastStartedAt: number;
    queued: number | null;
    timer: ReturnType<typeof setTimeout> | null;
  }>({
    inFlight: false,
    lastStartedAt: 0,
    queued: null,
    timer: null,
  });

  const live = useTopic<SystemVolumeState>('volume', enabled);

  // Self-referential callback: pumpVolumeWrites schedules itself via setTimeout
  // and re-invokes from postService().finally. Route both recursive call sites
  // through a ref so the lint rule's "accessed before declared" sees a stable
  // ref read, while preserving the live-coalesce timing (single function
  // identity, no re-creation on render).
  const pumpRef = useRef<() => void>(() => {});
  const pumpVolumeWrites = useCallback(() => {
    const write = volumeWrite.current;
    if (write.inFlight || write.queued == null) return;

    if (write.timer) {
      clearTimeout(write.timer);
      write.timer = null;
    }

    const elapsed = Date.now() - write.lastStartedAt;
    const delay = Math.max(0, LIVE_VOLUME_WRITE_INTERVAL_MS - elapsed);
    if (delay > 0) {
      write.timer = setTimeout(() => pumpRef.current(), delay);
      return;
    }

    const nextVolume = write.queued;
    write.queued = null;
    write.inFlight = true;
    write.lastStartedAt = Date.now();

    void postService('/system/volume', { volume: nextVolume }).finally(() => {
      write.inFlight = false;
      pumpRef.current();
    });
  }, []);
  // Keep the ref pointing at the latest callback. Identity is stable since the
  // useCallback has no deps, so this effectively runs once.
  useEffect(() => {
    pumpRef.current = pumpVolumeWrites;
  }, [pumpVolumeWrites]);

  useEffect(() => {
    if (!live) return;
    if (Date.now() < localOverrideUntil.current) return;
    // Mirror multiplex topic into local state. The local-override window
    // (set by previewVolume/commitVolume) intentionally suppresses these
    // updates so a slider drag isn't snapped back by a stale broadcast.
     
    setState({
      supported: !!live.supported,
      volume: typeof live.volume === 'number' ? live.volume : 0,
      muted: !!live.muted,
    });
  }, [live]);

  useEffect(() => {
    mounted.current = true;
    if (!enabled) return () => { mounted.current = false; };

    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const data = await fetchService<SystemVolumeState>('/system/volume');
      if (!mounted.current) return;
      if (data && Date.now() >= localOverrideUntil.current) {
        setState({
          supported: !!data.supported,
          volume: typeof data.volume === 'number' ? data.volume : 0,
          muted: !!data.muted,
        });
      }
      timer = setTimeout(tick, pollMs);
    };
    tick();
    return () => { mounted.current = false; clearTimeout(timer); };
  }, [enabled, pollMs]);

  useEffect(() => () => {
    const write = volumeWrite.current;
    if (write.timer) clearTimeout(write.timer);
    write.timer = null;
  }, []);

  const previewVolume = useCallback((v: number) => {
    localOverrideUntil.current = Date.now() + 1500;
    setState(s => ({ ...s, volume: Math.max(0, Math.min(1, v)) }));
  }, []);

  const commitVolume = useCallback((v: number, options?: CommitVolumeOptions) => {
    localOverrideUntil.current = Date.now() + 1500;
    const clamped = Math.max(0, Math.min(1, v));
    setState(s => ({ ...s, volume: clamped }));
    const write = volumeWrite.current;
    write.queued = clamped;
    if (options?.flush) write.lastStartedAt = 0;
    pumpVolumeWrites();
  }, [pumpVolumeWrites]);

  const setMuted = useCallback(async (muted: boolean) => {
    localOverrideUntil.current = Date.now() + 1500;
    setState(s => ({ ...s, muted }));
    await postService('/system/volume/mute', { muted });
  }, []);

  return { state, previewVolume, commitVolume, setMuted };
}
