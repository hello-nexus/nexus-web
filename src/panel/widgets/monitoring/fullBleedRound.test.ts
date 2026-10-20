// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as sass from 'sass';
import { join } from 'node:path';
import { panelGridCapacityForCanvas } from '../../engine/grid';
import { PHONE_WIDGET_REFERENCE_CELL } from '../../engine/panelGrid';
import { resolveEffectivePanelTheme, type PanelThemeState } from '../../theme/panelTheme';
import type { PanelSurface } from '../../types';

const scssPath = join(__dirname, 'MonitoringWidget.module.scss');
const scss = readFileSync(scssPath, 'utf8');
const css = sass.compile(scssPath).css;
const FIT = 0.85;

function rule(selector: string): string {
  const m = new RegExp(`${selector.replace(/[.>:]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css);
  expect(m, selector).not.toBeNull();
  return m![1];
}

// Evaluates a compiled calc() with the token and tile-scale variables resolved.
function evalCalc(expr: string, scale?: number): number {
  const body = expr
    .replace(/var\(--panel-round-fit,\s*[\d.]+\)/g, String(FIT))
    .replace(/var\(--_fb-scale\)/g, String(scale))
    .replace(/calc/g, '')
    .replace(/100%/g, '1');
  return Function(`return (${body});`)() as number;
}

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

  it('pads the full-bleed tile by a fraction of the box and lifts it to the display', () => {
    const pad = scssNumber('tile-pad');
    const tile = rule('.fullBleed');
    const percent = Number(/padding:\s*([\d.]+)%/.exec(tile)?.[1]);
    expect(percent / 100).toBeCloseTo(pad / box, 6);
    const scaleExpr = /--_fb-scale:\s*(calc\([^;]*\));/.exec(tile)?.[1];
    expect(scaleExpr).toBeDefined();
    const scale = evalCalc(scaleExpr!);
    // Padded slot is (1 - 2 * pad / box) of the box; scaled by the factor and
    // shrunk by the fit it must span the whole display diameter.
    expect(scale * (1 - (2 * pad) / box) * FIT).toBeCloseTo(1, 6);
    expect(tile).toContain('transform: scale(var(--_fb-scale))');
    expect(scss).not.toContain('--gauge-figure-scale');

    const ring = rule('.fullBleed .slotSelectable::after');
    const width = evalCalc(/width:\s*(calc\([^;]*\));/.exec(ring)![1], scale);
    const counter = evalCalc(/scale\((calc\([^;]*?\))\);/.exec(ring)![1], scale);
    // Ring spans the fit box of the slot on screen, at its original stroke scale.
    expect(width * counter).toBeCloseTo(FIT, 6);
    expect(counter * scale).toBeCloseTo(1, 6);
  });
});
