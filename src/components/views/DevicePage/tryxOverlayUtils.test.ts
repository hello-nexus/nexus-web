import { describe, expect, it } from 'vitest';
import {
  clampUnit,
  defaultOverlayItemPosition,
  scalePanelMetric,
  tryxFontCssStyle,
  tryxOverlayStatPlaceholder,
  TRYX_FONTS,
  TRYX_FONT_LABEL_KEYS,
  TRYX_LABEL_FONT_PANEL_PX,
  TRYX_LABEL_OFFSET_PANEL_PX,
  TRYX_VALUE_FONT_PANEL_PX,
} from './tryxOverlayUtils';

describe('defaultOverlayItemPosition', () => {
  it('stacks left-aligned slots 0.16 apart, starting at (0.04, 0.12)', () => {
    expect(defaultOverlayItemPosition(0)).toEqual({ x: 0.04, y: 0.12 });
    expect(defaultOverlayItemPosition(1)).toEqual({ x: 0.04, y: 0.28 });
    expect(defaultOverlayItemPosition(2)).toEqual({ x: 0.04, y: 0.44 });
  });
});

describe('clampUnit', () => {
  it('clamps to 0..1', () => {
    expect(clampUnit(-0.5)).toBe(0);
    expect(clampUnit(1.5)).toBe(1);
    expect(clampUnit(0.42)).toBe(0.42);
  });
});

describe('TRYX_FONTS / TRYX_FONT_LABEL_KEYS', () => {
  it('has exactly the 9 documented font options, each with a label key', () => {
    expect(TRYX_FONTS).toEqual([
      'roboto-regular', 'roboto-thin', 'roboto-light', 'roboto-medium',
      'roboto-bold', 'roboto-black', 'roboto-italic', 'roboto-condensed', 'monospace',
    ]);
    for (const font of TRYX_FONTS) {
      expect(TRYX_FONT_LABEL_KEYS[font]).toMatch(/^devices\.tryx\.font/);
    }
  });
});

describe('tryxFontCssStyle', () => {
  it('maps weight keywords to their numeric CSS weight', () => {
    expect(tryxFontCssStyle('roboto-thin').fontWeight).toBe(100);
    expect(tryxFontCssStyle('roboto-light').fontWeight).toBe(300);
    expect(tryxFontCssStyle('roboto-regular').fontWeight).toBe(400);
    expect(tryxFontCssStyle('roboto-medium').fontWeight).toBe(500);
    expect(tryxFontCssStyle('roboto-bold').fontWeight).toBe(700);
    expect(tryxFontCssStyle('roboto-black').fontWeight).toBe(900);
  });

  it('sets italic style only for roboto-italic', () => {
    expect(tryxFontCssStyle('roboto-italic').fontStyle).toBe('italic');
    expect(tryxFontCssStyle('roboto-regular').fontStyle).toBeUndefined();
  });

  it('uses the monospace font family only for monospace', () => {
    expect(tryxFontCssStyle('monospace').fontFamily).toBe('var(--font-mono)');
    expect(tryxFontCssStyle('roboto-regular').fontFamily).toBe('var(--font-sans)');
  });

  it('falls back to the regular style for an unknown font value', () => {
    expect(tryxFontCssStyle('not-a-font')).toEqual(tryxFontCssStyle('roboto-regular'));
  });
});

describe('scalePanelMetric', () => {
  it('scales the panel constant by size percent and preview height', () => {
    // At 100% size, a 1080px-tall preview reproduces the panel px 1:1.
    expect(scalePanelMetric(TRYX_VALUE_FONT_PANEL_PX, 100, 1080)).toBeCloseTo(130);
    expect(scalePanelMetric(TRYX_LABEL_FONT_PANEL_PX, 100, 1080)).toBeCloseTo(52);
    expect(scalePanelMetric(TRYX_LABEL_OFFSET_PANEL_PX, 100, 1080)).toBeCloseTo(150);
  });

  it('scales linearly with the size percent', () => {
    expect(scalePanelMetric(130, 50, 1080)).toBeCloseTo(65);
    expect(scalePanelMetric(130, 150, 1080)).toBeCloseTo(195);
  });

  it('scales linearly with a smaller preview height', () => {
    expect(scalePanelMetric(130, 100, 540)).toBeCloseTo(65);
  });
});

describe('tryxOverlayStatPlaceholder', () => {
  it('returns a representative value per stat', () => {
    expect(tryxOverlayStatPlaceholder('CPU Temperature')).toBe('45°C');
    expect(tryxOverlayStatPlaceholder('CPU Frequency')).toBe('4.7GHz');
    expect(tryxOverlayStatPlaceholder('CPU Usage')).toBe('18%');
    expect(tryxOverlayStatPlaceholder('Memory Utilization')).toBe('42%');
  });

  it('formats Date&Time from the given clock as HH:MM', () => {
    expect(tryxOverlayStatPlaceholder('Date&Time', new Date(2026, 0, 1, 9, 5))).toBe('09:05');
    expect(tryxOverlayStatPlaceholder('Date&Time', new Date(2026, 0, 1, 23, 47))).toBe('23:47');
  });

  it('falls back to a dash for an unrecognized stat', () => {
    expect(tryxOverlayStatPlaceholder('Unknown Stat')).toBe('--');
  });
});
