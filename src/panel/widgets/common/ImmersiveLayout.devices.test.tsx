import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ImmersiveLayout } from './ImmersiveLayout';
import { readRuntimePanelGrid } from '../../engine/panelGrid';
import { panelGridCapacityForCanvas } from '../../engine/grid';
import type { PanelSurface } from '../../types';

// End-to-end check of the bug surface: a real phone browser drives the runtime
// panel grid off window.innerWidth/innerHeight/devicePixelRatio (CSS px + DPR),
// and the 2-cell immersive widgets (lighting / cooling / benchmark /
// smart-lights) must render on ONE page on every device. The browser URL bar
// shrinks innerHeight, dropping the grid from the design's 4x8 to 4x6; before
// the ceil() fix that split the 2 cells across 2 pages.

function setViewport(cssWidth: number, cssHeight: number, dpr: number): void {
  for (const [k, v] of [['innerWidth', cssWidth], ['innerHeight', cssHeight], ['devicePixelRatio', dpr]] as const) {
    Object.defineProperty(window, k, { value: v, configurable: true, writable: true });
  }
}

// A single immersive page renders no PanelPageIndicator; multiple pages render
// one with role="tablist" + one dot per page.
function pageCount(): number {
  const tablist = screen.queryByRole('tablist');
  return tablist ? tablist.querySelectorAll('span').length : 1;
}

function pagesForGrid(cols: number, rows: number, cellCount: number, fillLast = true): number {
  const cells = Array.from({ length: cellCount }, (_, i) => <div key={i}>{i}</div>);
  render(<ImmersiveLayout cells={cells} gridColumns={cols} gridRows={rows} fillLast={fillLast} />);
  const n = pageCount();
  cleanup();
  return n;
}

// CSS-px layout viewport WIDTH and devicePixelRatio for each device (what the
// mobile browser reports). Heights are swept per-device below.
interface Device { name: string; w: number; dpr: number; }

const ANDROID: Device[] = [
  { name: 'OnePlus 12', w: 412, dpr: 3.5 },
  { name: 'OnePlus 12 (FHD+ mode)', w: 412, dpr: 2.625 },
  { name: 'OnePlus 13', w: 412, dpr: 3.5 },
  { name: 'OnePlus 11', w: 360, dpr: 4 },
  { name: 'OnePlus Nord 3', w: 393, dpr: 2.75 },
  { name: 'Pixel 6', w: 412, dpr: 2.625 },
  { name: 'Pixel 7', w: 412, dpr: 2.625 },
  { name: 'Pixel 8', w: 412, dpr: 2.625 },
  { name: 'Pixel 8 Pro', w: 448, dpr: 3 },
  { name: 'Pixel 9', w: 412, dpr: 2.625 },
  { name: 'Pixel 9 Pro', w: 427, dpr: 3 },
  { name: 'Pixel 9 Pro XL', w: 448, dpr: 3 },
  { name: 'Galaxy S22', w: 360, dpr: 3 },
  { name: 'Galaxy S23', w: 360, dpr: 3 },
  { name: 'Galaxy S23 Ultra', w: 384, dpr: 3.75 },
  { name: 'Galaxy S24', w: 360, dpr: 3 },
  { name: 'Galaxy S24+', w: 384, dpr: 2.8125 },
  { name: 'Galaxy S24 Ultra', w: 384, dpr: 3.75 },
  { name: 'Galaxy A54', w: 360, dpr: 3 },
  { name: 'Galaxy Z Fold cover', w: 344, dpr: 2.625 },
  { name: 'Xiaomi 14', w: 393, dpr: 2.75 },
  { name: 'Xiaomi 13', w: 393, dpr: 2.75 },
  { name: 'Redmi Note 13', w: 393, dpr: 2.75 },
  { name: 'Nothing Phone 2', w: 412, dpr: 2.625 },
  { name: 'Sony Xperia 1', w: 411, dpr: 3.5 },
  { name: 'Asus ROG Phone', w: 393, dpr: 2.75 },
  { name: 'Motorola Edge', w: 393, dpr: 2.75 },
];

const IOS: Device[] = [
  { name: 'iPhone SE (3rd gen)', w: 375, dpr: 2 },
  { name: 'iPhone 12 mini', w: 360, dpr: 3 },
  { name: 'iPhone 13 mini', w: 375, dpr: 3 },
  { name: 'iPhone 12 / 13 / 14', w: 390, dpr: 3 },
  { name: 'iPhone 14 Plus', w: 428, dpr: 3 },
  { name: 'iPhone 15 / 15 Pro', w: 393, dpr: 3 },
  { name: 'iPhone 15 Plus / Pro Max', w: 430, dpr: 3 },
  { name: 'iPhone 16 Pro', w: 402, dpr: 3 },
  { name: 'iPhone 16 Pro Max', w: 440, dpr: 3 },
];

const TABLETS: Device[] = [
  { name: 'iPad mini', w: 768, dpr: 2 },
  { name: 'iPad 10.9', w: 820, dpr: 2 },
  { name: 'iPad Air 11', w: 820, dpr: 2 },
  { name: 'iPad Pro 11', w: 834, dpr: 2 },
  { name: 'iPad Pro 13', w: 1024, dpr: 2 },
  { name: 'Galaxy Tab S9', w: 800, dpr: 2.25 },
];

const PHONES_AND_TABLETS = [...ANDROID, ...IOS, ...TABLETS];

// Realistic live innerHeight band for a phone in portrait: screen height is
// ~2.0-2.28x the CSS width (19.5:9 - 20.5:9). The browser content area is that
// minus chrome; the low end models a heavy URL bar + bottom bar, the high end
// models the URL bar hidden after scroll. Sweeping the whole band catches the
// worst case regardless of exact chrome height.
function heightBand(w: number): number[] {
  const lo = Math.round(w * 1.95);
  const hi = Math.round(w * 2.28);
  const out: number[] = [];
  for (let h = lo; h <= hi; h += 12) out.push(h);
  return out;
}

describe('ImmersiveLayout across simulated devices (2-cell immersive widgets)', () => {
  afterEach(cleanup);

  // The reported regression, pinned exactly: OnePlus 12 with the Chrome URL bar
  // visible -> 412x816 CSS, DPR 3.5 -> runtime grid 4x6.
  it('OnePlus 12 with URL bar (412x816 @ 3.5) stays on one page', () => {
    setViewport(412, 816, 3.5);
    const g = readRuntimePanelGrid('phone');
    expect(g.columns).toBe(4);
    expect(g.rows).toBe(6);
    expect(pagesForGrid(g.columns, g.rows, 2)).toBe(1);
  });

  it.each(PHONES_AND_TABLETS)('$name: 2 cells on one page across the live-height band (portrait)', ({ w, dpr }) => {
    let minRows = Infinity;
    let maxRows = 0;
    for (const h of heightBand(w)) {
      setViewport(w, h, dpr);
      const g = readRuntimePanelGrid('phone');
      minRows = Math.min(minRows, g.rows);
      maxRows = Math.max(maxRows, g.rows);
      // Pure pagination check at every height (cheap, no render).
      const fit = Math.max(1, Math.ceil(Math.max(g.columns, g.rows) / 4));
      expect(Math.ceil(2 / fit)).toBe(1);
    }
    // Render the real component at the worst (fewest-rows) height in the band.
    setViewport(w, Math.round(w * 1.95), dpr);
    const worst = readRuntimePanelGrid('phone');
    expect(pagesForGrid(worst.columns, worst.rows, 2)).toBe(1);
    // Sanity: the band never collapses below 6 rows on a real phone/tablet.
    expect(minRows).toBeGreaterThanOrEqual(6);
  });

  it.each(PHONES_AND_TABLETS)('$name: 2 cells on one page in landscape', ({ w, dpr }) => {
    // Landscape: swap to a wide viewport (screen long side as width).
    const longSide = Math.round(w * 2.1);
    setViewport(longSide, w, dpr);
    const g = readRuntimePanelGrid('phone');
    expect(pagesForGrid(g.columns, g.rows, 2)).toBe(1);
  });
});

// Fixed-geometry Nexus surfaces go through the same pagination. Driven by their
// native px so the result matches a real connected panel and the simulator.
describe('ImmersiveLayout across fixed Nexus panel surfaces', () => {
  afterEach(cleanup);

  const FIXED: { name: string; w: number; h: number; dpi: number; surface: PanelSurface; expectRows: number; expectPages: number }[] = [
    { name: 'Y70 Touch 2.5K', w: 682, h: 2560, dpi: 337, surface: 'y70', expectRows: 16, expectPages: 1 },
    { name: 'Y70 Touch 4K', w: 1100, h: 3840, dpi: 283, surface: 'y70', expectRows: 16, expectPages: 1 },
    // Q60 is a fixed 2x4 - too small to show a 4x4 preview + editor together, so
    // a 2-cell widget paginates here both before and after the fix (ceil==floor
    // at long axis 4). Pinned to document that the change is a no-op on Q60.
    { name: 'Q60', w: 720, h: 1280, dpi: 220, surface: 'q60', expectRows: 4, expectPages: 2 },
  ];

  it.each(FIXED)('$name: grid $expectRows rows -> $expectPages page(s) for a 2-cell widget', ({ w, h, dpi, surface, expectRows, expectPages }) => {
    const g = panelGridCapacityForCanvas(w, h, { surface, dpi });
    expect(g.rows).toBe(expectRows);
    expect(pagesForGrid(g.columns, g.rows, 2)).toBe(expectPages);
  });
});
