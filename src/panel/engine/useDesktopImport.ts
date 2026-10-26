import { useEffect, useRef } from 'react';
import { patchPanelDevice, type DesktopImportDto } from '../../api/panel';
import type { PanelLayout } from '../types';
import { snapLegacySize } from './legacySize';
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
 * then clears the import. The size is re-read until it stops changing, so a window still being
 * refitted by the host never feeds the plan.
 */
export function useDesktopImport({ enabled, hostReady, deviceId, pending, layout, paddingPercent, grid }: {
  enabled: boolean;
  hostReady: () => boolean;
  deviceId: string | undefined;
  pending: DesktopImportDto | null | undefined;
  layout: PanelLayout;
  paddingPercent: number;
  grid: RuntimeGrid;
}): void {
  const busyRef = useRef(false);
  const aliveRef = useRef(false);
  const attemptRef = useRef({ key: '', count: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef({ pending, layout, paddingPercent, grid, hostReady });
  useEffect(() => { latestRef.current = { pending, layout, paddingPercent, grid, hostReady }; });

  const key = importKey(pending);
  const active = enabled && !!deviceId && key !== '';
  useEffect(() => {
    if (!active || !deviceId) return undefined;
    aliveRef.current = true;
    if (attemptRef.current.key !== key) attemptRef.current = { key, count: 0 };
    let lastSize = '';
    let waits = 0;
    const arm = (ms: number) => { timerRef.current = setTimeout(tick, ms); };
    const sizeNow = () => `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`;
    function tick() {
      timerRef.current = null;
      const latest = latestRef.current;
      if (!aliveRef.current || busyRef.current || !hasPendingImport(latest.pending)) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (w <= 0 || h <= 0 || !latest.hostReady()) {
        if (++waits <= IMPORT_MAX_WAITS) arm(IMPORT_SETTLE_MS);
        return;
      }
      const size = sizeNow();
      if (size !== lastSize) {
        lastSize = size;
        arm(IMPORT_SETTLE_MS);
        return;
      }
      place(latest, w, h);
    }
    function place(latest: typeof latestRef.current, w: number, h: number) {
      if (!hasPendingImport(latest.pending)) return;
      busyRef.current = true;
      const dpr = Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
      const { imp, base } = importBase(latest.pending, latest.layout);
      const plan = planDesktopImport(imp, { w, h, dpr, ...kioskOriginFromSearch(window.location.search) }, latest.paddingPercent, base, latest.grid, snapLegacySize);
      const failed = () => {
        busyRef.current = false;
        if (!aliveRef.current) return;
        const delay = IMPORT_RETRY_MS[attemptRef.current.count++];
        if (delay !== undefined) {
          lastSize = '';
          arm(delay);
        }
      };
      // Stays busy after a save until the cleared record arrives, so a stale render cannot place twice.
      void patchPanelDevice(deviceId as string, {
        layout: plan.layout,
        ...(plan.gridSlots !== undefined ? { gridSlots: plan.gridSlots } : {}),
        clearDesktopImport: true,
      }).then(saved => { if (!saved) failed(); }, failed);
    }
    // A resize restarts the quiet interval.
    const onResize = () => { lastSize = ''; };
    window.addEventListener('resize', onResize);
    arm(0);
    return () => {
      aliveRef.current = false;
      window.removeEventListener('resize', onResize);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [active, key, deviceId]);
}
