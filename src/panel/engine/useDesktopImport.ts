import { useEffect, useRef } from 'react';
import { patchPanelDevice, type DesktopImportDto } from '../../api/panel';
import type { PanelLayout } from '../types';
import { snapLegacySize } from './legacySize';
import { hasPendingImport, importBase, planDesktopImport, type ImportGrid } from './desktopImport';

// Waits between save attempts after a failed one; the last step is the final try.
export const IMPORT_RETRY_MS = [2_000, 5_000, 15_000, 30_000] as const;

/** Places a legacy desktop-widget layout once the panel has its real size, then clears the import. */
export function useDesktopImport({ enabled, deviceId, pending, layout, paddingPercent, grid }: {
  enabled: boolean;
  deviceId: string | undefined;
  pending: DesktopImportDto | null | undefined;
  layout: PanelLayout;
  paddingPercent: number;
  grid: ImportGrid;
}): void {
  const busyRef = useRef(false);
  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef({ layout, paddingPercent, grid });
  useEffect(() => { latestRef.current = { layout, paddingPercent, grid }; });

  const active = enabled && !!deviceId && hasPendingImport(pending);
  useEffect(() => {
    if (!active || !pending || !deviceId) return undefined;
    const place = () => {
      timerRef.current = null;
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (busyRef.current || w <= 0 || h <= 0) return;
      busyRef.current = true;
      const dpr = Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
      const latest = latestRef.current;
      const { imp, base } = importBase(pending, latest.layout);
      const plan = planDesktopImport(imp, { w, h, dpr }, latest.paddingPercent, base, latest.grid, snapLegacySize);
      const failed = () => {
        busyRef.current = false;
        const delay = IMPORT_RETRY_MS[attemptRef.current++];
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
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [active, pending, deviceId]);
}
