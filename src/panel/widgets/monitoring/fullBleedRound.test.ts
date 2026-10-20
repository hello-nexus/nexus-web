// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = __dirname;
const widgetScss = readFileSync(join(DIR, 'MonitoringWidget.module.scss'), 'utf8');
const tokens = readFileSync(join(DIR, '../../styles/tokens.scss'), 'utf8');

function num(source: string, pattern: RegExp): number {
  const m = pattern.exec(source);
  expect(m, String(pattern)).not.toBeNull();
  return Number(m![1]);
}

describe('round full-bleed monitoring tile', () => {
  const pad = num(widgetScss, /\$tile-pad:\s*(\d+);/);
  const box = num(widgetScss, /\$round-box:\s*(\d+);/);
  const fit = num(tokens, /--panel-round-fit:\s*([\d.]+);/);
  const block = /\.fullBleed\s*\{([\s\S]*?)\n\}/.exec(widgetScss)?.[1] ?? '';

  it('keeps the normal tile padding and scales the whole tile', () => {
    expect(block).not.toMatch(/padding:\s*0/);
    expect(block).toMatch(/transform:\s*scale\(/);
    expect(block).not.toContain('--gauge-figure-scale');
  });

  it('derives the factor from the layout box, the tile padding and the card fit', () => {
    expect(block).toContain('#{$round-box} / (#{$round-box} - #{2 * $tile-pad}) / var(--panel-round-fit');
    // Padded slot lifted to the rim box: (box / fit) / (box - 2 * pad).
    const factor = box / (box - 2 * pad) / fit;
    expect(factor * (box - 2 * pad)).toBeCloseTo(box / fit, 6);
    expect(factor).toBeGreaterThan(1);
  });

  it('leaves no gauge scaling only its figure layer', () => {
    for (const f of readdirSync(join(DIR, 'gauges')).filter(n => n.endsWith('.scss'))) {
      expect(readFileSync(join(DIR, 'gauges', f), 'utf8'), f).not.toContain('--gauge-figure-scale');
    }
  });
});
