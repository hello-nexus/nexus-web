import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchService, postService } from '../api/service';
import { useTopic } from './useMultiplexSocket';

export interface SystemVolumeState {
  supported: boolean;
  volume: number;
  muted: boolean;
  /** What a targeted read resolved to. Absent on the plain default-output read. */
  kind?: 'output' | 'app';
  id?: string;
  name?: string;
}

/** Per-widget choice of what the slider drives; see GET /system/volume/target. */
export interface VolumeTargetQuery {
  mode: 'auto' | 'app' | 'output';
  /** Media session key the auto and app modes resolve against. */
  source: string;
  /** Output mode only; empty follows the system default. */
  deviceId: string;
}

const DEFAULT_STATE: SystemVolumeState = { supported: false, volume: 0, muted: false };
const LIVE_VOLUME_WRITE_INTERVAL_MS = 80;

export interface CommitVolumeOptions {
  flush?: boolean;
}

function targetPath(target: VolumeTargetQuery): string {
  const q = new URLSearchParams({ mode: target.mode, source: target.source, deviceId: target.deviceId });
  return `/system/volume/target?${q.toString()}`;
}

/**
 * System default-render audio volume + mute. Subscribes to the multiplexed
 * "volume" WebSocket topic for live push (server broadcasts on every change),
 * and falls back to HTTP polling so the initial state populates and updates
 * survive a WS disconnect. Volume writes are live-coalesced during slider drag:
 * the UI updates immediately, the service gets the latest value at a short
 * interval, and pointer-up flushes the final value.
 *
 * With a target, the service resolves it to an output or an app on every read
 * and writes go to whatever the last read resolved to.
 */
export function useSystemVolume(enabled: boolean, target?: VolumeTargetQuery | null, pollMs = 1000) {
  const [state, setState] = useState<SystemVolumeState>(DEFAULT_STATE);
  const localOverrideUntil = useRef(0);
  const mounted = useRef(true);
  const volumeWrite = useRef<{
    inFlight: boolean;
    lastStartedAt: number;
    queued: number | null;
    queuedCommit: boolean;
    timer: ReturnType<typeof setTimeout> | null;
  }>({
    inFlight: false,
    lastStartedAt: 0,
    queued: null,
    queuedCommit: true,
    timer: null,
  });
  const targetKey = target ? targetPath(target) : '';
  const currentTargetKey = useRef(targetKey);
  const resolved = useRef<{ kind: 'output' | 'app'; id: string } | null>(null);

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
    const commit = write.queuedCommit;
    write.queued = null;
    write.inFlight = true;
    write.lastStartedAt = Date.now();

    const request = !targetKey
      ? postService('/system/volume', { volume: nextVolume })
      : resolved.current
        ? postService('/system/volume/target', { ...resolved.current, volume: nextVolume, commit })
        : Promise.resolve(null);
    void request.finally(() => {
      write.inFlight = false;
      pumpRef.current();
    });
  }, [targetKey]);
  useEffect(() => {
    pumpRef.current = pumpVolumeWrites;
  }, [pumpVolumeWrites]);

  const refresh = useCallback(async () => {
    const data = await fetchService<SystemVolumeState>(targetKey || '/system/volume');
    // A read that outlived a target change describes the previous target.
    if (!mounted.current || targetKey !== currentTargetKey.current) return;
    if (!data) return;
    // Writes follow the target even mid-drag; only the displayed level waits.
    if (targetKey) {
      resolved.current = data.kind ? { kind: data.kind, id: data.id ?? '' } : null;
    }
    if (Date.now() < localOverrideUntil.current) return;
    setState({
      supported: !!data.supported,
      volume: typeof data.volume === 'number' ? data.volume : 0,
      muted: !!data.muted,
      ...(targetKey ? { kind: data.kind, id: data.id ?? '', name: data.name ?? '' } : {}),
    });
  }, [targetKey]);
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);
  // Until the new target's first read lands, writes drop rather than hit the old target.
  useEffect(() => { currentTargetKey.current = targetKey; resolved.current = null; }, [targetKey]);

  useEffect(() => {
    if (!live) return;
    if (Date.now() < localOverrideUntil.current) return;
    // A frame with no numeric volume is the change ping, not a state - reading
    // it as one is what snapped the fader to zero and greyed it out until the
    // next poll. The local-override window (set by previewVolume/commitVolume)
    // suppresses both so a slider drag isn't snapped back by a stale broadcast.
    // A targeted slider takes every frame as a ping: the frame describes the
    // default output, which may not be what the target resolves to.
    if (targetKey || typeof live.volume !== 'number') {
      void refreshRef.current();
      return;
    }
    setState({
      supported: !!live.supported,
      volume: live.volume,
      muted: !!live.muted,
    });
  }, [live, targetKey]);

  useEffect(() => {
    mounted.current = true;
    if (!enabled) return () => { mounted.current = false; };

    // Per-effect, not the shared mounted ref: a tick in flight across a
    // dependency change would otherwise resume and start a second loop.
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      await refreshRef.current();
      if (cancelled) return;
      timer = setTimeout(tick, pollMs);
    };
    tick();
    return () => { cancelled = true; mounted.current = false; clearTimeout(timer); };
  }, [enabled, pollMs, targetKey]);

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
    // The service stores an app's level on release only, not on mid-drag frames.
    write.queuedCommit = !!options?.flush;
    if (options?.flush) write.lastStartedAt = 0;
    pumpVolumeWrites();
  }, [pumpVolumeWrites]);

  const setMuted = useCallback(async (muted: boolean) => {
    localOverrideUntil.current = Date.now() + 1500;
    setState(s => ({ ...s, muted }));
    if (!targetKey) {
      await postService('/system/volume/mute', { muted });
    } else if (resolved.current) {
      await postService('/system/volume/target/mute', { ...resolved.current, muted });
    }
  }, [targetKey]);

  return { state, previewVolume, commitVolume, setMuted };
}
