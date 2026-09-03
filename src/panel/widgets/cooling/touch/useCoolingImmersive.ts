import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyProfile, fetchFanChannels, fetchProfiles, isFanDisconnected, setFanControlled, setFanLock,
  type FanChannel,
} from '../../../../api/cooling';
import { useCoolingRealtime } from '../../../../hooks/useCooling';
import { useTopicCallback } from '../../../../hooks/useMultiplexSocket';
import { publishControlSync, subscribeControlSync } from '../../../../lib/controlSync';
import { loadCoolingCache, setCachedCoolingActivePreset } from '../coolingCache';
import { isCoolingModeKey, type CoolingModeKey } from '../page/coolingModes';

// Optimistic-lock window shared with CoolingPage / CoolingWidget: after a
// local mode change, stale topic / control-sync pushes are ignored for this
// long so they can't snap the UI back mid-transition.
const PRESET_LOCK_MS = 1500;

export interface CoolingImmersiveController {
  /** Connected channels with live RPM / duty merged in; unresponsive hardware is hidden on panels. */
  channels: FanChannel[];
  activeMode: CoolingModeKey | null;
  /** Counts the Nexus Control flag, not "currently driven": Off drives nothing, and only the flag is what "Control all" resolves. */
  controlledFanCount: number;
  applyMode: (key: CoolingModeKey) => void;
  claimAllFans: () => void;
}

/**
 * Data layer for the cooling immersive view: the active mode plus the fan channels,
 * seeded from the page's localStorage cache, then resynced on the 'cooling' / 'prefs'
 * topics and cross-surface control-sync.
 */
export function useCoolingImmersive(): CoolingImmersiveController {
  const cachedSeed = useMemo(() => loadCoolingCache(), []);
  const [allChannels, setAllChannels] = useState<FanChannel[]>(() => cachedSeed.channels);
  const [activeMode, setActiveMode] = useState<CoolingModeKey | null>(() => cachedSeed.activeMode);
  const presetLockUntilRef = useRef(0);
  const activeProfileRef = useRef('');

  const refreshChannels = useCallback(async () => {
    const fans = await fetchFanChannels();
    if (fans?.channels) setAllChannels(fans.channels);
  }, []);

  const refresh = useCallback(async () => {
    const [, profiles] = await Promise.all([refreshChannels(), fetchProfiles()]);
    if (profiles?.active && Date.now() >= presetLockUntilRef.current) {
      activeProfileRef.current = profiles.active;
      if (isCoolingModeKey(profiles.active)) {
        setActiveMode(profiles.active);
        // Only the mode is known here, so only that slice of the page's cache is written back.
        setCachedCoolingActivePreset(profiles.active);
      }
    }
  }, [refreshChannels]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Every cooling-config mutation lands a 'cooling' push from the service.
  const onCoolingTopic = useCallback(() => {
    if (Date.now() < presetLockUntilRef.current) return;
    void refresh();
  }, [refresh]);
  useTopicCallback('cooling', true, onCoolingTopic);

  // Profile switches broadcast on 'prefs'; refetch only when the active
  // profile actually changed instead of polling fetchProfiles.
  const onPrefsTopic = useCallback(() => {
    if (Date.now() < presetLockUntilRef.current) return;
    void (async () => {
      const profiles = await fetchProfiles();
      const next = profiles?.active ?? '';
      if (!next || next === activeProfileRef.current) return;
      activeProfileRef.current = next;
      void refresh();
    })();
  }, [refresh]);
  useTopicCallback('prefs', true, onPrefsTopic);

  useEffect(() => subscribeControlSync(event => {
    if (event.domain !== 'cooling') return;
    const next = event.activePreset ?? event.activeProfile;
    if (next && isCoolingModeKey(next) && Date.now() >= presetLockUntilRef.current) {
      activeProfileRef.current = next;
      setActiveMode(next);
    }
    void refresh();
  }), [refresh]);

  // Live RPM / duty merge from the realtime topic.
  const realtimeData = useCoolingRealtime(true);
  useEffect(() => {
    if (!realtimeData?.coolingComponents) return;
    const map = new Map<string, { rpm: number; speed: number }>();
    for (const comp of realtimeData.coolingComponents)
      for (const dev of comp.devices)
        map.set(dev.id, { rpm: dev.rpm ?? 0, speed: dev.speed ?? 0 });
    setAllChannels(prev => prev.map(ch => {
      const live = map.get(ch.id);
      return live ? { ...ch, rpm: live.rpm, dutyPercent: live.speed } : ch;
    }));
  }, [realtimeData]);

  const channels = useMemo(() => allChannels.filter(c => !isFanDisconnected(c)), [allChannels]);

  // A locked fan is skipped by the modes and this surface has no rail to unlock it from, so
  // it is unlocked on sight, as on the desktop simple page. Latched per id: every unlock
  // refetches the channels, and a fan the service refuses to unlock would loop otherwise.
  const unlockAttemptedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const ch of channels) {
      if (!ch.locked || unlockAttemptedRef.current.has(ch.id)) continue;
      unlockAttemptedRef.current.add(ch.id);
      void setFanLock(ch.id, false).then(refreshChannels);
    }
  }, [channels, refreshChannels]);
  const controlledFanCount = useMemo(
    () => channels.filter(ch => ch.controlled !== false).length,
    [channels],
  );

  const applyMode = useCallback((key: CoolingModeKey) => {
    if (key === activeMode) return;
    // Lock first so pushes triggered by this write can't revert the
    // optimistic update below.
    presetLockUntilRef.current = Date.now() + PRESET_LOCK_MS;
    setActiveMode(key);
    activeProfileRef.current = key;
    publishControlSync({ domain: 'cooling', activePreset: key });
    // Seeds the page's cache so a later navigation to /cooling paints the right mode on first frame.
    setCachedCoolingActivePreset(key);
    void applyProfile(key).then(() => refresh()).catch(() => { /* best-effort */ });
  }, [activeMode, refresh]);

  // Sequential: each write re-derives the active preset service-side, and concurrent writes race that.
  const claimAllFans = useCallback(async () => {
    for (const ch of channels) {
      if (ch.controlled === false) await setFanControlled(ch.id, true);
    }
    await refreshChannels();
  }, [channels, refreshChannels]);

  return {
    channels,
    activeMode,
    controlledFanCount,
    applyMode,
    claimAllFans: () => { void claimAllFans(); },
  };
}
