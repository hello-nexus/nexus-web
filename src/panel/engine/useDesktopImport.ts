import { useEffect, useRef } from 'react';
import { patchPanelDevice, type DesktopImportDto } from '../../api/panel';
import type { PanelLayout, PanelSurface } from '../types';
import { snapLegacySize } from './legacySize';
import { onHostOrigin, onHostRequestHitTest, type KioskOrigin } from '../device/panelHostBridge';
import { hasPendingImport, importBase, kioskOriginFromSearch, planDesktopImport, type RuntimeGrid } from './desktopImport';

// Quiet interval the window size must hold before the import is planned, and how many such waits a missing host or size is given.
export const IMPORT_SETTLE_MS = 400;
export const IMPORT_MAX_WAITS = 50;

// Waits between save attempts after a failed one; the last step is the final try.
export const IMPORT_RETRY_MS = [2_000, 5_000, 15_000, 30_000] as const;

/** Identity of an import across record refetches: the same legacy layout keeps one retry budget. */
export function importKey(imp: DesktopImportDto | null | undefined): string {
  return hasPendingImport(imp) ? `${imp.version}:${imp.widgets.map(w => w.id).join(',')}` : '';
}

/**
 * Places a legacy desktop-widget layout once the host is listening and the window holds its size,
 * then clears the import. The size and origin are re-read until they stop changing, so a window the
 * host is still refitting never feeds the plan. A later resize, host message, record change or the
 * page becoming visible restarts a wait that gave up.
 */
export function useDesktopImport({ enabled, hostReady, deviceId, pending, layout, paddingPercent, grid, singlePage = false, densitySlots, glassSurface }: {
  enabled: boolean;
  hostReady: () => boolean;
  deviceId: string | undefined;
  pending: DesktopImportDto | null | undefined;
  layout: PanelLayout;
  paddingPercent: number;
  grid: RuntimeGrid;
  singlePage?: boolean;
  // The glass's density-derived short-axis count, which the size options scale.
  densitySlots?: number;
  // The glass whose Widget size options choose the grid; a plain OS display when absent.
  glassSurface?: PanelSurface;
  // A merge into an existing layout still chooses the Widget size from the legacy cell.
}): void {
  // Set while a save is in flight; holds the effect instance that sent it.
  const busyRef = useRef<object | null>(null);
  const attemptRef = useRef({ key: '', count: 0 });
  const kickRef = useRef<(() => void) | null>(null);
  // The import a save already went through for, until the record stops carrying it.
  const placedKeyRef = useRef('');
  const latestRef = useRef({ pending, layout, paddingPercent, grid, hostReady, singlePage, densitySlots, glassSurface });
  useEffect(() => { latestRef.current = { pending, layout, paddingPercent, grid, hostReady, singlePage, densitySlots, glassSurface }; });

  const key = importKey(pending);
  const active = enabled && !!deviceId && key !== '';

  useEffect(() => { if (!active) placedKeyRef.current = ''; }, [active]);

  // A record change restarts a wait that gave up.
  useEffect(() => { kickRef.current?.(); }, [pending]);

  useEffect(() => {
    if (!active || !deviceId) return undefined;
    const token = {};
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastSize = '';
    let waits = 0;
    let origin: KioskOrigin = kioskOriginFromSearch(window.location.search);
    if (attemptRef.current.key !== key) attemptRef.current = { key, count: 0 };

    const arm = (ms: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(tick, ms);
    };
    const sizeNow = () => `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`;
    function tick() {
      timer = null;
      const latest = latestRef.current;
      if (!alive || busyRef.current || placedKeyRef.current === key || !hasPendingImport(latest.pending)) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (w <= 0 || h <= 0 || !latest.hostReady()) {
        if (++waits <= IMPORT_MAX_WAITS) arm(IMPORT_SETTLE_MS);
        return;
      }
      const size = `${sizeNow()}:${origin.originX},${origin.originY},${origin.fullW ?? ''},${origin.fullH ?? ''}`;
      if (size !== lastSize) {
        lastSize = size;
        arm(IMPORT_SETTLE_MS);
        return;
      }
      place(latest, w, h);
    }
    function place(latest: typeof latestRef.current, w: number, h: number) {
      if (!hasPendingImport(latest.pending)) return;
      busyRef.current = token;
      const dpr = Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
      const { imp, base } = importBase(latest.pending, latest.layout);
      const plan = planDesktopImport(imp, { w, h, dpr, ...origin }, latest.paddingPercent, base, latest.grid, snapLegacySize, { singlePage: latest.singlePage, densitySlots: latest.densitySlots, glassSurface: latest.glassSurface });
      const failed = () => {
        if (busyRef.current === token) busyRef.current = null;
        if (!alive) {
          // The instance that replaced this one may be waiting on the save.
          kickRef.current?.();
          return;
        }
        const delay = IMPORT_RETRY_MS[attemptRef.current.count++];
        if (delay !== undefined) {
          lastSize = '';
          arm(delay);
        }
      };
      void patchPanelDevice(deviceId as string, {
        layout: plan.layout,
        ...(plan.widgetSize !== undefined ? { widgetSize: plan.widgetSize } : {}),
        ...(plan.widgetsLocked ? { widgetsLocked: true } : {}),
        clearDesktopImport: true,
      }).then(saved => {
        if (!saved) failed();
        // The cleared record ends the import; one with a new key is placed afresh.
        else {
          placedKeyRef.current = key;
          if (busyRef.current === token) busyRef.current = null;
        }
      }, failed);
    }
    // Restarts the wait from scratch, also when it had given up.
    const kick = () => {
      if (!alive || busyRef.current) return;
      waits = 0;
      lastSize = '';
      arm(0);
    };
    kickRef.current = kick;
    const onVisible = () => { if (document.visibilityState === 'visible') kick(); };
    const offOrigin = onHostOrigin(next => { origin = next; kick(); });
    const offRequest = onHostRequestHitTest(kick);
    window.addEventListener('resize', kick);
    document.addEventListener('visibilitychange', onVisible);
    arm(0);
    return () => {
      alive = false;
      if (kickRef.current === kick) kickRef.current = null;
      if (timer) clearTimeout(timer);
      offOrigin();
      offRequest();
      window.removeEventListener('resize', kick);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [active, key, deviceId]);
}
