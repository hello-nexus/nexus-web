import { useEffect, useState } from 'react';
import { fetchService } from '../api/service';
import { fetchMusicReactive, fetchGlobalBrightness, fetchLightingDevices, type LightingDevice } from '../api/lighting';
import { fetchSmartLights, type SmartLightsResponse } from '../api/smartLights';
import { fetchObsStatus, type ObsStatusResponse } from '../api/obs';
import { fetchDiscordStatus, type DiscordStatusResponse } from '../api/discord';
import { fetchCloudAccounts, type GetAccountsResponse } from '../api/cloud';
import { fetchSystemVolume, type SystemVolumeState } from '../api/system';
import { getTrackingStatus } from '../hooks/useScreenTimeBrowse';
import { DEV_TOOLS } from '../lib/devTools';

/** Live service state behind the palette's stateful entries (toggles that
 *  show their current position, per-device rows). Every field is null until
 *  its fetch lands and stays null where the endpoint is unreachable, so a
 *  source can gate its entries on data actually being there. */
export interface SearchLiveState {
  musicReactive: boolean | null;
  telemetry: boolean | null;
  tracking: boolean | null;
  /** Master lighting brightness, 0..1. */
  globalBrightness: number | null;
  lightingDevices: LightingDevice[] | null;
  smartLights: SmartLightsResponse | null;
  obs: ObsStatusResponse | null;
  discord: DiscordStatusResponse | null;
  cloud: GetAccountsResponse | null;
  volume: SystemVolumeState | null;
}

export const EMPTY_LIVE_STATE: SearchLiveState = {
  musicReactive: null,
  telemetry: null,
  tracking: null,
  globalBrightness: null,
  lightingDevices: null,
  smartLights: null,
  obs: null,
  discord: null,
  cloud: null,
  volume: null,
};

/**
 * Fetch the live states once per palette open (`enabled` flipping true), the
 * same pattern as usePanelToggles. All best-effort: a failed fetch leaves its
 * field null and the palette simply omits those entries.
 */
export function useSearchLiveState(enabled: boolean): SearchLiveState {
  const [state, setState] = useState<SearchLiveState>(EMPTY_LIVE_STATE);
  useEffect(() => {
    // Drop the snapshot on close/offline so a reopen against a dead service
    // never offers stale toggles that would post into nothing.
    if (!enabled) { setState(EMPTY_LIVE_STATE); return; }
    let cancelled = false;
    void Promise.all([
      fetchMusicReactive().catch(() => null),
      fetchService<{ enabled: boolean }>('/telemetry/consent').catch(() => null),
      getTrackingStatus().catch(() => null),
      fetchGlobalBrightness().catch(() => null),
      fetchLightingDevices().catch(() => null),
      fetchSmartLights().catch(() => null),
      fetchObsStatus().catch(() => null),
      fetchDiscordStatus().catch(() => null),
      DEV_TOOLS ? fetchCloudAccounts().catch(() => null) : Promise.resolve(null),
      fetchSystemVolume().catch(() => null),
    ]).then(([music, telemetry, tracking, brightness, lightingDevices, smartLights, obs, discord, cloud, volume]) => {
      if (cancelled) return;
      setState({
        musicReactive: music ? music.enabled : null,
        telemetry: telemetry ? telemetry.enabled : null,
        tracking: tracking ? tracking.enabled : null,
        globalBrightness: brightness ? brightness.value : null,
        lightingDevices: lightingDevices ? lightingDevices.devices : null,
        smartLights: smartLights ?? null,
        obs: obs ?? null,
        discord: discord ?? null,
        cloud: cloud ?? null,
        volume: volume ?? null,
      });
    });
    return () => { cancelled = true; };
  }, [enabled]);
  return state;
}
