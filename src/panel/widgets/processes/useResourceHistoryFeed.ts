import { useEffect, useRef } from 'react';
import * as store from '../../../lib/monitoringStore';
import { RESOURCE_HISTORY_KEYS, RESOURCE_KEYS, systemValue } from './processesResources';

/**
 * Keeps the four resource histories filling from the tile, so the immersive
 * graph cards open already drawn instead of building up over the next minute.
 *
 * Samples on every monitoring frame rather than on the host's own render, which
 * the refresh setting can slow to one in five - a history buffer has to advance
 * per frame or the graphs read at the wrong time base. pushPanelSensorSample
 * dedups by key + frameTick, so a mounted card sampling the same key is free.
 *
 * `enabled` is false in preview: the catalog must never write into this shared,
 * key-addressed store.
 */
export function useResourceHistoryFeed(enabled: boolean, gpuEnabled: boolean): void {
  const gpuRef = useRef(gpuEnabled);
  gpuRef.current = gpuEnabled;

  useEffect(() => {
    if (!enabled) return;
    const onFrame = () => {
      const frame = store.getMonitoringFrame();
      const rows = store.getAllProcessValues();
      for (const resource of RESOURCE_KEYS) {
        if (resource === 'gpu' && !gpuRef.current) continue;
        store.pushPanelSensorSample(RESOURCE_HISTORY_KEYS[resource], systemValue(resource, frame, rows));
      }
    };
    store.subscribe(onFrame);
    return () => store.unsubscribe(onFrame);
  }, [enabled]);
}
