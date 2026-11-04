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
// Must stay well under the service's idle limit for an unrefreshed backlight preview.
const PREVIEW_KEEPALIVE_MS = 2000;

interface DragSession {
  latest: number | null;
  persisted: number | null;
  tail: Promise<unknown> | null;
}

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
  // The writer is latest-wins, so the newest call's flag describes the value it dispatches.
  const persistNext = useRef(false);
  // Per-target drag state, replaced whole when a target is left so a late reply cannot touch the next.
  const sess = useRef<DragSession>({ latest: null, persisted: null, tail: null });
  const closing = useRef(false);
  // The target a queued value was written for; the writer outlives a target change.
  const targetKey = `${kind ?? ''}:${recordId ?? displayId ?? ''}`;
  const writeKey = useRef(targetKey);
  const keepAlive = useRef<ReturnType<typeof setInterval> | null>(null);

  const send = useCallback((v: number) => {
    if (kind === 'y70') return postService('/y70/brightness', { brightness: v });
    if (kind === 'record' && recordId) {
      if (closing.current || writeKey.current !== targetKey) return Promise.resolve(null);
      const mine = sess.current;
      const request = persistNext.current
        ? patchPanelDevice(recordId, { lcdBrightness: v }).then(r => { mine.persisted = v; return r; })
        : postService(`/panel/devices/${encodeURIComponent(recordId)}/backlight-preview`, { lcdBrightness: v });
      mine.tail = request;
      return request;
    }
    return displayId ? setDisplayBrightness(displayId, v) : Promise.resolve(null);
  }, [kind, displayId, recordId, targetKey]);
  const write = useLatestWriter(send, WRITE_INTERVAL_MS);

  const stopKeepAlive = useCallback(() => {
    if (keepAlive.current) clearInterval(keepAlive.current);
    keepAlive.current = null;
  }, []);

  // Declared after the writer, so its own unmount flush has already dispatched what it will.
  // Closing turns any later deferred send into a no-op; the persist then waits only for what is
  // already in flight, and covers whatever value never reached the record.
  useEffect(() => {
    closing.current = false;
    return () => {
      stopKeepAlive();
      if (kind !== 'record' || !recordId || sess.current.latest === null) return;
      closing.current = true;
      const left = sess.current;
      sess.current = { latest: null, persisted: null, tail: null };
      void (async () => {
        await left.tail?.catch(() => null);
        if (left.latest !== null && left.latest !== left.persisted) {
          await patchPanelDevice(recordId, { lcdBrightness: left.latest }).catch(() => null);
        }
      })();
    };
  }, [kind, recordId, stopKeepAlive]);

  const preview = useCallback((v: number) => {
    overrideUntil.current = Date.now() + OVERRIDE_MS;
    const clamped = Math.max(0, Math.min(100, Math.round(v)));
    setValue(clamped);
    sess.current.latest = clamped;
    persistNext.current = false;
    writeKey.current = targetKey;
    write(clamped);
    // The service drops a preview that goes quiet, so a held slider keeps refreshing it.
    if (kind === 'record' && !keepAlive.current) {
      keepAlive.current = setInterval(() => {
        const level = sess.current.latest;
        if (level !== null && !persistNext.current) {
          writeKey.current = targetKey;
          write(level);
        }
      }, PREVIEW_KEEPALIVE_MS);
    }
  }, [write, kind, targetKey]);

  const commit = useCallback((v: number) => {
    overrideUntil.current = Date.now() + OVERRIDE_MS;
    const clamped = Math.max(0, Math.min(100, Math.round(v)));
    setValue(clamped);
    stopKeepAlive();
    sess.current.latest = clamped;
    persistNext.current = true;
    writeKey.current = targetKey;
    write(clamped, true);
  }, [write, stopKeepAlive, targetKey]);

  return { available, linkDown, value, preview, commit };
}
