import { describe, expect, it } from 'vitest';
import { LEGACY_SIMULATED_SCREEN_IDS, SIMULATED_SCREEN_CATALOG } from './simulatedScreenCatalog';
import { KRAKEN_PANEL_DPI, PANEL_SURFACES } from '../panel/types';
import { DEFAULT_SURFACE_DPI } from '../panel/engine/panelGrid';
import { SURFACE_DPR } from '../panel/embed/simulatedPanelViewport';
import { simulatedPanelIcon } from '../hooks/usePanelDevices';
import { PANEL_MONITOR_ICON } from '../panel/device/panelDevices';

describe('simulated screen catalog', () => {
  it('has unique ids and unique names', () => {
    const ids = SIMULATED_SCREEN_CATALOG.map(s => s.id);
    const names = SIMULATED_SCREEN_CATALOG.map(s => s.name);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it('uses only surfaces the web knows and positive geometry', () => {
    for (const s of SIMULATED_SCREEN_CATALOG) {
      expect(PANEL_SURFACES, s.id).toContain(s.surface);
      expect(s.width, s.id).toBeGreaterThan(0);
      expect(s.height, s.id).toBeGreaterThan(0);
      expect(s.dpi, s.id).toBeGreaterThan(0);
      expect(s.vendor, s.id).not.toBe('');
    }
  });

  it('brands every entry from a vendor with a mark', () => {
    const marked = new Set(['HYTE', 'NZXT', 'Lian Li', 'Corsair', 'ASUS']);
    for (const s of SIMULATED_SCREEN_CATALOG.filter(x => marked.has(x.vendor))) {
      expect(simulatedPanelIcon(s), s.id).not.toBe(PANEL_MONITOR_ICON);
    }
  });

  it('keeps the density literals equal to the surface defaults the real devices use', () => {
    const measured = new Set(['lianli-hydroshift2-curve']);
    const cooler = SIMULATED_SCREEN_CATALOG.filter(x => x.surface.startsWith('lcd-') && !measured.has(x.id) && x.family !== 'nzxt-kraken');
    expect(cooler.length).toBeGreaterThan(0);
    for (const s of cooler) expect(s.dpi, s.id).toBe(DEFAULT_SURFACE_DPI[s.surface]);
    expect(SIMULATED_SCREEN_CATALOG.find(x => x.id === 'monitor')?.dpi).toBe(DEFAULT_SURFACE_DPI.monitor);
  });

  it('keeps every simulated Kraken at the density the real one reports', () => {
    const krakens = SIMULATED_SCREEN_CATALOG.filter(x => x.family === 'nzxt-kraken');
    expect(krakens.length).toBeGreaterThan(0);
    for (const s of krakens) {
      expect(s.surface, s.id).toBe('lcd-round');
      expect(s.dpi, s.id).toBe(KRAKEN_PANEL_DPI);
    }
  });

  it('has a render DPR for every cooler-glass surface so the preview is 1:1', () => {
    for (const s of SIMULATED_SCREEN_CATALOG.filter(x => x.surface.startsWith('lcd-'))) {
      expect(SURFACE_DPR[s.surface], s.id).toBe(1);
    }
  });

  it('maps every legacy id to a catalog entry', () => {
    const ids = new Set(SIMULATED_SCREEN_CATALOG.map(s => s.id));
    for (const target of Object.values(LEGACY_SIMULATED_SCREEN_IDS)) expect(ids.has(target)).toBe(true);
    for (const legacy of Object.keys(LEGACY_SIMULATED_SCREEN_IDS)) expect(ids.has(legacy)).toBe(false);
  });

  it('keeps every id a pre-redesign build could have stored resolvable', () => {
    const ids = new Set(SIMULATED_SCREEN_CATALOG.map(s => s.id));
    const stored = ['y70', 'y70-4k', 'q60', 'kraken', 'lcd-round-480', 'lcd-square-480', 'lcd-wide-1600', 'lcd-round-240', 'xeneon-edge', 'phone', 'tablet'];
    for (const id of stored) expect(ids.has(LEGACY_SIMULATED_SCREEN_IDS[id] ?? id), id).toBe(true);
  });
});
