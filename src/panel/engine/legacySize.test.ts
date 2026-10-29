// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { APP_REGISTRY, sizesForSurface } from '../widgets/registry';
import { planDesktopImport } from './desktopImport';
import { snapLegacySize } from './legacySize';
import { forcedGridOf, type PanelLayout } from '../types';

const empty = (): PanelLayout => ({ layoutSchemaVersion: 2, surface: 'monitor', pages: [{ id: 'p1', widgets: [] }] });

describe('snapLegacySize', () => {
  it('keeps a size the type allows and snaps one it does not', () => {
    const clock = APP_REGISTRY.clock.meta;
    const allowed = sizesForSurface(clock, 'monitor', true);
    expect(snapLegacySize('clock', allowed[0], undefined)).toBe(allowed[0]);
    expect(allowed).toContain(snapLegacySize('clock', '2x4', undefined) as never);
  });

  it('leaves an unknown type alone', () => {
    expect(snapLegacySize('app:com.example.unknown', '2x4', undefined)).toBe('2x4');
  });

  it('places on the snapped span, not the legacy one', () => {
    const forced = forcedGridOf(18, true);
    const type = Object.entries(APP_REGISTRY).find(([, a]) => !a.meta.freeform && !sizesForSurface(a.meta, 'monitor', true, forced).includes('2x4' as never) && sizesForSurface(a.meta, 'monitor', true, forced).length > 0)![0];
    const imp = { version: 1 as const, cellPx: 86, cellUnits: 'device' as const, merge: false, widgets: [{ id: 'a', type, size: '2x4', col: 0, row: 0 }] };
    const plan = planDesktopImport(imp, { w: 2560, h: 1440, dpr: 1 }, 100, empty(), undefined, snapLegacySize);
    const placed = plan.layout.pages[0].widgets[0];
    expect(placed.size).not.toBe('2x4');
    expect(sizesForSurface(APP_REGISTRY[type].meta, 'monitor', true, forcedGridOf(plan.gridSlots, true))).toContain(placed.size as never);
  });
});
