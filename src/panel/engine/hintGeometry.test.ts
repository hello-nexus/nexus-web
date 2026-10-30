import { describe, expect, it } from 'vitest';
import { SINGLE_WIDGET_SURFACE_SIZE } from '../types';
import { sizeToSpan } from './grid';
import { fitNoticeContent, freeRects, isRoomyFreeRect, largestFreeRect, splitOrientation } from './hintGeometry';

const canvas = { width: 400, height: 200 };

describe('largestFreeRect', () => {
  it('is the whole canvas when no widget covers it', () => {
    expect(largestFreeRect(canvas, [])).toEqual({ left: 0, top: 0, width: 400, height: 200 });
  });

  it('takes the larger side of a widget on the left', () => {
    expect(largestFreeRect(canvas, [{ left: 0, top: 0, width: 100, height: 200 }])).toEqual({ left: 100, top: 0, width: 300, height: 200 });
  });

  it('finds the free band under a widget', () => {
    expect(largestFreeRect(canvas, [{ left: 0, top: 0, width: 400, height: 50 }])).toEqual({ left: 0, top: 50, width: 400, height: 150 });
  });

  it('works around widgets in two corners', () => {
    const free = largestFreeRect(canvas, [
      { left: 0, top: 0, width: 150, height: 100 },
      { left: 250, top: 100, width: 150, height: 100 },
    ]);
    expect(free && free.width * free.height).toBe(250 * 100);
  });

  it('ignores widgets outside the canvas and returns null when widgets fill it', () => {
    expect(largestFreeRect(canvas, [{ left: 500, top: 0, width: 50, height: 50 }])).toEqual({ left: 0, top: 0, width: 400, height: 200 });
    expect(largestFreeRect(canvas, [{ left: 0, top: 0, width: 400, height: 200 }])).toBeNull();
  });
});

describe('isRoomyFreeRect', () => {
  it('accepts a generous area and rejects a sliver or a small corner', () => {
    expect(isRoomyFreeRect({ left: 0, top: 0, width: 200, height: 100 }, canvas)).toBe(true);
    expect(isRoomyFreeRect({ left: 0, top: 0, width: 400, height: 10 }, canvas)).toBe(false);
    expect(isRoomyFreeRect({ left: 0, top: 0, width: 30, height: 30 }, canvas)).toBe(false);
  });
});

describe('splitOrientation', () => {
  it('picks side only for the wide cooler surface', () => {
    const orientation = (surface: keyof typeof SINGLE_WIDGET_SURFACE_SIZE) => {
      const span = sizeToSpan(SINGLE_WIDGET_SURFACE_SIZE[surface]!);
      return splitOrientation(span.cols, span.rows);
    };
    expect(orientation('lcd-wide')).toBe('side');
    expect(orientation('q60')).toBe('stacked');
    expect(orientation('lcd-round')).toBe('stacked');
    expect(orientation('lcd-square')).toBe('stacked');
  });
});

describe('fitNoticeContent', () => {
  const label = 'Edit background'.length;

  it('keeps the label inside a round half: content width stays within the inscribed box', () => {
    const d = 640;
    const fit = fitNoticeContent({ width: d, height: d / 2, round: true, part: 'end', labelChars: label, diameter: d });
    expect(fit.font * label * 0.6).toBeLessThanOrEqual(d * 0.66 + 0.001);
    expect(fit.icon + fit.font * 1.3).toBeLessThanOrEqual(d * 0.21 + 4);
  });

  it('shrinks the label for a longer translation', () => {
    const base = fitNoticeContent({ width: 300, height: 300, round: false, part: 'end', labelChars: 15 });
    const long = fitNoticeContent({ width: 300, height: 300, round: false, part: 'end', labelChars: 40 });
    expect(long.font).toBeLessThan(base.font);
  });

  it('gives a whole round canvas more room than one half', () => {
    const half = fitNoticeContent({ width: 600, height: 300, round: true, part: 'start', labelChars: label, diameter: 600 });
    const full = fitNoticeContent({ width: 600, height: 600, round: true, part: 'full', labelChars: label, diameter: 600 });
    expect(full.icon).toBeGreaterThan(half.icon);
  });
});

describe('freeRects', () => {
  const area = (rs: { width: number; height: number }[]) => rs.reduce((sum, r) => sum + r.width * r.height, 0);

  it('covers the canvas minus the widgets and never touches a widget', () => {
    const widgets = [
      { left: 0, top: 0, width: 150, height: 100 },
      { left: 250, top: 100, width: 150, height: 100 },
    ];
    const free = freeRects(canvas, widgets);
    expect(area(free)).toBe(400 * 200 - 2 * 150 * 100);
    for (const f of free) {
      for (const w of widgets) {
        const overlaps = f.left < w.left + w.width && f.left + f.width > w.left && f.top < w.top + w.height && f.top + f.height > w.top;
        expect(overlaps).toBe(false);
      }
    }
  });

  it('is the whole canvas with no widgets and empty when widgets fill it', () => {
    expect(freeRects(canvas, [])).toEqual([{ left: 0, top: 0, width: 400, height: 200 }]);
    expect(freeRects(canvas, [{ left: 0, top: 0, width: 400, height: 200 }])).toEqual([]);
  });
});
