// Vendor-agnostic WebHID peripheral manager. Vendors register in
// src/lib/webhid/* and appear here without this file changing.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isWebHidAvailable,
  requestPeripheral,
  getGrantedPeripherals,
} from '../lib/webhid/discovery';
import type { WebHidPeripheral } from '../lib/webhid/peripheral';
import type { Peripheral } from './usePeripherals';

export interface WebHidPeripheralState {
  available: boolean;
  peripherals: Peripheral[];
  /** Triggers Chrome's picker - must be called from a user-gesture. */
  requestDevice: () => Promise<void>;
  /** Re-poll live state for all granted devices. */
  refresh: () => Promise<void>;
}

/** Map of peripheral-id to its opened WebHID wrapper so capability widgets can
 *  dispatch writes via peripheralBackend.ts. */
const PERIPHERAL_REGISTRY = new Map<string, WebHidPeripheral>();

export function getWebHidPeripheral(id: string): WebHidPeripheral | undefined {
  return PERIPHERAL_REGISTRY.get(id);
}

/** Convert a wrapper's snapshot into the shared Peripheral DTO shape. Returns
 *  null if the device fails to snapshot (disconnected mid-session etc.). */
async function toPeripheralDto(p: WebHidPeripheral): Promise<Peripheral | null> {
  try {
    const snap = await p.snapshot();
    return {
      id: snap.id,
      name: snap.name,
      vendor: snap.vendor,
      category: snap.category,
      vendorId: snap.vendorId,
      productId: snap.productId,
      serial: '',
      firmwareVersion: '',
      isWireless: snap.isWireless,
      capabilities: snap.capabilities,
      source: 'webhid',
      dpi: snap.dpi ? {
        minDpi: snap.dpi.minDpi,
        maxDpi: snap.dpi.maxDpi,
        step: snap.dpi.step,
        stageCount: 0,
        activeStage: -1,
        stageDpi: [],
        current: snap.dpi.current,
      } : undefined,
      polling: snap.polling ? {
        supportedHz: snap.polling.supportedHz,
        currentHz: snap.polling.currentHz,
      } : undefined,
      battery: snap.battery,
      sleep: snap.sleep,
    };
  } catch (err) {
    console.warn('[webhid] snapshot failed', err);
    return null;
  }
}

export function useWebHidPeripherals(enabled: boolean): WebHidPeripheralState {
  const [peripherals, setPeripherals] = useState<Peripheral[]>([]);
  const available = isWebHidAvailable();
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!available) return;
    const wrappers = await getGrantedPeripherals();

    const next: Peripheral[] = [];
    const aliveIds = new Set<string>();
    for (const w of wrappers) {
      PERIPHERAL_REGISTRY.set(w.id, w);
      const dto = await toPeripheralDto(w);
      if (dto) {
        next.push(dto);
        aliveIds.add(dto.id);
      }
    }

    // Drop registry entries whose peripheral dropped off the granted list or
    // failed to snapshot this round (disconnected, powered off, etc.).
    for (const key of PERIPHERAL_REGISTRY.keys()) {
      if (!aliveIds.has(key)) {
        const p = PERIPHERAL_REGISTRY.get(key);
        PERIPHERAL_REGISTRY.delete(key);
        try { p?.close?.(); } catch { /* swallow */ }
      }
    }

    if (mountedRef.current) {
      setPeripherals(next);
    }
  }, [available]);

  const requestDevice = useCallback(async () => {
    if (!available) return;
    const wrapper = await requestPeripheral();
    if (wrapper) {
      await refresh();
    }
  }, [available, refresh]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled || !available) return;

    // Initial snapshot of granted WebHID devices; subsequent updates arrive
    // via the navigator.hid connect/disconnect listeners and the 10s refresh
    // below.
    refresh();

    // WebHID fires connect/disconnect when a granted device plugs or unplugs.
    const onHidChange = () => { refresh(); };
    navigator.hid?.addEventListener('connect', onHidChange as EventListener);
    navigator.hid?.addEventListener('disconnect', onHidChange as EventListener);

    // Periodic refresh (10s) so live values (battery %, on-device DPI
    // changes) stay current.
    const id = setInterval(refresh, 10_000);

    return () => {
      mountedRef.current = false;
      navigator.hid?.removeEventListener('connect', onHidChange as EventListener);
      navigator.hid?.removeEventListener('disconnect', onHidChange as EventListener);
      clearInterval(id);
    };
  }, [enabled, available, refresh]);

  return { available, peripherals, requestDevice, refresh };
}
