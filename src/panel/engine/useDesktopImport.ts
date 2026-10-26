import { useEffect, useRef } from 'react';
import { patchPanelDevice, type DesktopImportDto } from '../../api/panel';
import type { PanelLayout } from '../types';
import { snapLegacySize } from './legacySize';
import { hasPendingImport, importBase, kioskOriginFromSearch, planDesktopImport, type RuntimeGrid } from './desktopImport';

// Waits between save attempts after a failed one; the last step is the final try.
export const IMPORT_RETRY_MS = [2_000, 5_000, 15_000, 30_000] as const;

/** Identity of an import across record refetches: the same legacy layout keeps one retry budget. */
export function importKey(imp: DesktopImportDto | null | undefined): string {
  return hasPendingImport(imp) ? `${imp.version}:${imp.widgets.map(w => w.id).join(',')}` : '';
}

/** Places a legacy desktop-widget layout once the panel has its real size, then clears the import. */
export function useDesktopImport({ enabled, deviceId, pending, layout, paddingPercent, grid }: {
  enabled: boolean;
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
  const latestRef = useRef({ pending, layout, paddingPercent, grid });
  useEffect(() => { latestRef.current = { pending, layout, paddingPercent, grid }; });

  const key = importKey(pending);
  const active = enabled && !!deviceId && key !== '';
  useEffect(() => {
    if (!active || !deviceId) return undefined;
    aliveRef.current = true;
    if (attemptRef.current.key !== key) attemptRef.current = { key, count: 0 };
    const place = () => {
      timerRef.current = null;
      const latest = latestRef.current;
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (!aliveRef.current || busyRef.current || !hasPendingImport(latest.pending) || w <= 0 || h <= 0) return;
      busyRef.current = true;
      const dpr = Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
      const { imp, base } = importBase(latest.pending, latest.layout);
      const plan = planDesktopImport(imp, { w, h, dpr, ...kioskOriginFromSearch(window.location.search) }, latest.paddingPercent, base, latest.grid, snapLegacySize);
      const failed = () => {
        busyRef.current = false;
        if (!aliveRef.current) return;
        const delay = IMPORT_RETRY_MS[attemptRef.current.count++];
        if (delay !== undefined) timerRef.current = setTimeout(place, delay);
      };
      // Stays busy after a save until the cleared record arrives, so a stale render cannot place twice.
      void patchPanelDevice(deviceId, {
        layout: plan.layout,
        ...(plan.gridSlots !== undefined ? { gridSlots: plan.gridSlots } : {}),
        clearDesktopImport: true,
      }).then(saved => { if (!saved) failed(); }, failed);
    };
    if (!busyRef.current && timerRef.current === null) place();
    return () => {
      aliveRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [active, key, deviceId]);
}
