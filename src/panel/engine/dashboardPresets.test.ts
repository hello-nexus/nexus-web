import { describe, expect, it } from 'vitest';
import { DASHBOARD_SAMPLE_PRESET_IDS, dashboardSamplePresetLayout } from './dashboardPresets';
import { DESKTOP_GRID_COLUMNS, DESKTOP_GRID_ROWS } from './panelGrid';
import { sizeToSpan } from './grid';
import { APP_REGISTRY, appAvailableForSurface } from '../widgets/registry';

describe('dashboard presets', () => {
  for (const id of DASHBOARD_SAMPLE_PRESET_IDS) {
    it(`${id} places desktop-available apps at allowed sizes without overlap`, () => {
      const layout = dashboardSamplePresetLayout(id);
      expect(layout.surface).toBe('desktop');
      expect(layout.pages).toHaveLength(1);
      const taken = new Set<string>();
      for (const w of layout.pages[0].widgets) {
        const app = APP_REGISTRY[w.type];
        expect(app, w.type).toBeDefined();
        expect(appAvailableForSurface(app.meta, 'desktop'), w.type).toBe(true);
        expect(app.meta.sizes, w.type).toContain(w.size);
        const span = sizeToSpan(w.size);
        expect(w.col + span.cols).toBeLessThanOrEqual(DESKTOP_GRID_COLUMNS);
        expect(w.row + span.rows).toBeLessThanOrEqual(DESKTOP_GRID_ROWS);
        for (let c = w.col; c < w.col + span.cols; c++) {
          for (let r = w.row; r < w.row + span.rows; r++) {
            const cell = `${c},${r}`;
            expect(taken.has(cell), `${id} overlap at ${cell}`).toBe(false);
            taken.add(cell);
          }
        }
      }
    });
  }

  it('gives every applied widget a fresh id', () => {
    const a = dashboardSamplePresetLayout('monitoring').pages[0].widgets.map(w => w.id);
    const b = dashboardSamplePresetLayout('monitoring').pages[0].widgets.map(w => w.id);
    expect(new Set([...a, ...b]).size).toBe(a.length * 2);
  });
});
