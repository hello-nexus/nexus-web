// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { panelGridCapacityForCanvas } from '../../engine/grid';
import { PHONE_WIDGET_REFERENCE_CELL } from '../../engine/panelGrid';
import { resolveEffectivePanelTheme, type PanelThemeState } from '../../theme/panelTheme';
import type { PanelSurface } from '../../types';

const scss = readFileSync(join(__dirname, 'MonitoringWidget.module.scss'), 'utf8');

function scssNumber(name: string): number {
  const m = new RegExp(`\\$${name}:\\s*(\\d+);`).exec(scss);
  expect(m, name).not.toBeNull();
  return Number(m![1]);
}

const ROUND_SURFACES: PanelSurface[] = ['kraken', 'lcd-round'];
const GLASS_SIZES = [640, 320, 240, 400, 480];

describe('round full-bleed monitoring tile geometry', () => {
  const box = scssNumber('round-box');

  for (const surface of ROUND_SURFACES) {
    for (const size of GLASS_SIZES) {
      it(`${surface} at ${size}: a 2x2 lays out in the stylesheet's box with no gap or label strip`, () => {
        const cap = panelGridCapacityForCanvas(size, size, { surface, paddingRatio: 0.09 });
        const layoutBox = (2 * cap.cellSize) / (cap.contentScale / PHONE_WIDGET_REFERENCE_CELL);
        expect(layoutBox).toBeCloseTo(box, 6);
        expect(cap.gap).toBe(0);
        const theme = resolveEffectivePanelTheme({ widgetLabels: true } as PanelThemeState, surface);
        expect(theme.widgetLabels).toBe(false);
      });
    }
  }

  it('pads the full-bleed tile by a fraction of the box, not a fixed length', () => {
    expect(scss).toContain('$tile-pad-fraction: math.div($tile-pad, $round-box);');
    expect(scss).toContain('padding: math.percentage($tile-pad-fraction);');
    expect(scss).not.toContain('--gauge-figure-scale');
  });
});
