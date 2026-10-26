import { useEffect, useRef } from 'react';
import { patchPanelDevice, type DesktopImportDto } from '../../api/panel';
import type { PanelLayout } from '../types';
import { hasPendingImport, planDesktopImport, type ImportGrid } from './desktopImport';

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
  useEffect(() => {
    if (!enabled || !deviceId || !hasPendingImport(pending) || busyRef.current) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w <= 0 || h <= 0) return;
    busyRef.current = true;
    const dpr = Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
    // A fresh panel starts empty; a merge keeps what the user already placed.
    const base: PanelLayout = pending.merge
      ? layout
      : { ...layout, pages: [{ id: layout.pages[0]?.id ?? 'page-1', widgets: [] }], activePageId: undefined };
    const plan = planDesktopImport(pending, { w, h, dpr }, paddingPercent, base, grid);
    // Stays busy after a save until the cleared record arrives, so a stale render cannot place twice.
    void patchPanelDevice(deviceId, {
      layout: plan.layout,
      ...(plan.gridSlots !== undefined ? { gridSlots: plan.gridSlots } : {}),
      clearDesktopImport: true,
    }).then(saved => { if (!saved) busyRef.current = false; }, () => { busyRef.current = false; });
  }, [enabled, deviceId, pending, layout, paddingPercent, grid]);
}
