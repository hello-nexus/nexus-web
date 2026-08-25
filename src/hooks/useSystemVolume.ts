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

  // Two shapes ride this topic: the monitoring broadcaster pushes the full
  // state, PanelTopics.BroadcastVolume pushes a valueless change ping.
  const live = useTopic<Partial<SystemVolumeState>>('volume', enabled);

  // pumpVolumeWrites schedules itself via setTimeout and re-invokes from
  // postService().finally. Both recursive call sites route through a ref to
  // keep one stable function identity (no re-creation on render).
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
  useEffect(() => {
    pumpRef.current = pumpVolumeWrites;
  }, [pumpVolumeWrites]);

  const refresh = useCallback(async () => {
    const data = await fetchService<SystemVolumeState>('/system/volume');
    if (!mounted.current) return;
    if (!data || Date.now() < localOverrideUntil.current) return;
    setState({
      supported: !!data.supported,
      volume: typeof data.volume === 'number' ? data.volume : 0,
      muted: !!data.muted,
    });
  }, []);
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);

  useEffect(() => {
    if (!live) return;
    if (Date.now() < localOverrideUntil.current) return;
    // A frame with no numeric volume is the change ping, not a state - reading
    // it as one is what snapped the fader to zero and greyed it out until the
    // next poll. The local-override window (set by previewVolume/commitVolume)
    // suppresses both so a slider drag isn't snapped back by a stale broadcast.
    if (typeof live.volume !== 'number') {
      void refreshRef.current();
      return;
    }
    setState({
      supported: !!live.supported,
      volume: live.volume,
      muted: !!live.muted,
    });
  }, [live]);

  useEffect(() => {
    mounted.current = true;
    if (!enabled) return () => { mounted.current = false; };

    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      await refreshRef.current();
      if (!mounted.current) return;
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
