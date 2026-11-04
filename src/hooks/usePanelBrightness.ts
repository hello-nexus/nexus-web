import { useCallback, useEffect, useRef, useState } from 'react';
import { useLatestWriter } from './useLatestWriter';
import { fetchService, postService } from '../api/service';
import { fetchDisplayBrightness, setDisplayBrightness } from '../api/displays';
import { fetchPanelDeviceWithStatus, patchPanelDevice } from '../api/panel';
import type { DeviceListItem } from './useDevices';

export type PanelBrightnessKind = 'y70' | 'record' | 'display';

export interface PanelBrightnessTarget {
  kind: PanelBrightnessKind;
  // Required for 'display'.
  displayId?: string;
  // Required for 'record'.
  recordId?: string;
}

const DEFAULT_RECORD_BRIGHTNESS = 100;

// Which hardware path a surface's brightness slider drives: the Y70's own
// backlight, the panel's own backlight through its record (a panel whose
// capabilities carry supportsBrightness; the record id is passed only then),
// a promoted touch monitor over DDC, or nothing.
export function brightnessTargetFor(
  surface: string,
  displayId: string | undefined,
  backlightRecordId?: string,
): PanelBrightnessTarget | null {
  if (surface === 'y70') return { kind: 'y70' };
  if (backlightRecordId) return { kind: 'record', recordId: backlightRecordId };
  if (displayId) return { kind: 'display', displayId };
  return null;
}

// The Y70 shows this device warning while only its video link is up.
export function isY70UsbDown(devices: DeviceListItem[] | null): boolean {
  const y70 = devices?.find(d => d.id === 'y70');
  return y70?.warning === 'usb-disconnected';
}

const WRITE_INTERVAL_MS = 120;
const OVERRIDE_MS = 1500;

/**
 * Brightness for the surface this panel runs on, 0-100. `available` is false
 * until a read proves the control exists (hidden then); `linkDown` is the
 * Y70's USB link warning, which disables the slider with an inline notice.
 * Reads again each time `enabled` turns on. The slider writes live during a
 * drag (coalesced) and the release flushes.
 */
export function usePanelBrightness(enabled: boolean, target: PanelBrightnessTarget | null) {
  const [value, setValue] = useState(0);
  const [available, setAvailable] = useState(false);
  const [linkDown, setLinkDown] = useState(false);
  const overrideUntil = useRef(0);
  const kind = target?.kind ?? null;
  const displayId = target?.displayId;
  const recordId = target?.recordId;

  useEffect(() => {
    if (!enabled || !kind) return undefined;
    let cancelled = false;
    void (async () => {
      if (kind === 'y70') {
        const [b, devices] = await Promise.all([
          fetchService<{ brightness: number }>('/y70/brightness').catch(() => null),
          fetchService<DeviceListItem[]>('/devices/all').catch(() => null),
        ]);
        if (cancelled) return;
        const down = isY70UsbDown(devices);
        const read = !!b && typeof b.brightness === 'number';
        setLinkDown(down);
        // A failed read hides the slider, unless the link warning explains it.
        setAvailable(read || down);
        if (read && b && Date.now() >= overrideUntil.current) setValue(b.brightness);
      } else if (kind === 'record' && recordId) {
        const r = await fetchPanelDeviceWithStatus(recordId).catch(() => null);
        if (cancelled) return;
        const found = !!r && r.found;
        setAvailable(found);
        if (found && Date.now() >= overrideUntil.current) setValue(r.record.lcdBrightness ?? DEFAULT_RECORD_BRIGHTNESS);
      } else if (displayId) {
        const b = await fetchDisplayBrightness(displayId).catch(() => null);
        if (cancelled) return;
        const ok = !!b && b.status !== 'unsupported' && typeof b.brightness === 'number';
        setAvailable(ok);
        if (ok && b && Date.now() >= overrideUntil.current) setValue(b.brightness);
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, kind, displayId, recordId]);

  // Record target: a drag step only previews the backlight (no record write or
  // broadcast); the released value, and a drag cut short by unmount, persist.
  const persistValue = useRef<number | null>(null);
  const unpersisted = useRef<number | null>(null);

  const send = useCallback((v: number) => {
    if (kind === 'y70') return postService('/y70/brightness', { brightness: v });
    if (kind === 'record' && recordId) {
      if (persistValue.current === v) {
        persistValue.current = null;
        return patchPanelDevice(recordId, { lcdBrightness: v });
      }
      return postService(`/panel/devices/${encodeURIComponent(recordId)}/backlight-preview`, { lcdBrightness: v });
    }
    return displayId ? setDisplayBrightness(displayId, v) : Promise.resolve(null);
  }, [kind, displayId, recordId]);
  const write = useLatestWriter(send, WRITE_INTERVAL_MS);

  useEffect(() => () => {
    const pending = unpersisted.current;
    unpersisted.current = null;
    if (kind === 'record' && recordId && pending !== null) {
      void patchPanelDevice(recordId, { lcdBrightness: pending }).catch(() => null);
    }
  }, [kind, recordId]);

  const preview = useCallback((v: number) => {
    overrideUntil.current = Date.now() + OVERRIDE_MS;
    const clamped = Math.max(0, Math.min(100, Math.round(v)));
    setValue(clamped);
    unpersisted.current = clamped;
    write(clamped);
  }, [write]);

  const commit = useCallback((v: number) => {
    overrideUntil.current = Date.now() + OVERRIDE_MS;
    const clamped = Math.max(0, Math.min(100, Math.round(v)));
    setValue(clamped);
    unpersisted.current = null;
    persistValue.current = clamped;
    write(clamped, true);
  }, [write]);

  return { available, linkDown, value, preview, commit };
}
