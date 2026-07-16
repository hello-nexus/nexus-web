import { describe, expect, it } from 'vitest';
import {
  clampWindow,
  hitZoneAt,
  msToPx,
  panWindow,
  pxToMs,
  resizeLeftEdge,
  resizeRightEdge,
  snapToEnd,
} from './timelineBrushUtils';

describe('msToPx / pxToMs', () => {
  it('round-trip a timestamp through pixel space', () => {
    const domainStart = 1_000_000;
    const domainEnd = 2_000_000;
    const width = 400;
    const px = msToPx(1_500_000, domainStart, domainEnd, width);
    expect(px).toBe(200);
    expect(pxToMs(px, domainStart, domainEnd, width)).toBe(1_500_000);
  });

  it('clamps neither end (callers clamp) - maps beyond-domain timestamps linearly', () => {
    expect(msToPx(3_000_000, 1_000_000, 2_000_000, 100)).toBe(200);
  });

  it('does not divide by zero for a degenerate domain or width', () => {
    expect(msToPx(500, 500, 500, 100)).toBe(0);
    expect(Number.isFinite(pxToMs(50, 0, 1000, 0))).toBe(true);
  });
});

describe('hitZoneAt', () => {
  it('detects the left edge within tolerance', () => {
    expect(hitZoneAt(100, 100, 300, 6)).toBe('left-edge');
    expect(hitZoneAt(104, 100, 300, 6)).toBe('left-edge');
  });

  it('detects the right edge within tolerance', () => {
    expect(hitZoneAt(300, 100, 300, 6)).toBe('right-edge');
    expect(hitZoneAt(296, 100, 300, 6)).toBe('right-edge');
  });

  it('edge zones win over the box for a narrow window', () => {
    expect(hitZoneAt(50, 48, 52, 6)).toBe('left-edge');
  });

  it('detects the box between the edges', () => {
    expect(hitZoneAt(200, 100, 300, 6)).toBe('box');
  });

  it('detects the track outside the window', () => {
    expect(hitZoneAt(50, 100, 300, 6)).toBe('track');
    expect(hitZoneAt(350, 100, 300, 6)).toBe('track');
  });
});

describe('clampWindow', () => {
  const domainStart = 0;
  const domainEnd = 10_000;

  it('leaves an already-valid window untouched', () => {
    expect(clampWindow(1000, 5000, domainStart, domainEnd, 100)).toEqual([1000, 5000]);
  });

  it('grows a too-narrow window to the minimum, extending the right edge', () => {
    expect(clampWindow(1000, 1050, domainStart, domainEnd, 500)).toEqual([1000, 1500]);
  });

  it('pulls the window back inside the domain start, preserving width', () => {
    expect(clampWindow(-500, 1500, domainStart, domainEnd, 100)).toEqual([0, 2000]);
  });

  it('pulls the window back inside the domain end, preserving width', () => {
    expect(clampWindow(9000, 11000, domainStart, domainEnd, 100)).toEqual([8000, 10000]);
  });
});

describe('panWindow', () => {
  const domainStart = 0;
  const domainEnd = 10_000;

  it('shifts both edges by deltaMs', () => {
    expect(panWindow(1000, 2000, 500, domainStart, domainEnd)).toEqual([1500, 2500]);
  });

  it('clamps at the domain start, preserving width', () => {
    expect(panWindow(1000, 2000, -2000, domainStart, domainEnd)).toEqual([0, 1000]);
  });

  it('clamps at the domain end, preserving width', () => {
    expect(panWindow(8000, 9000, 5000, domainStart, domainEnd)).toEqual([9000, 10000]);
  });
});

describe('resizeLeftEdge', () => {
  it('accepts a valid candidate', () => {
    expect(resizeLeftEdge(5000, 2000, 0, 100)).toBe(2000);
  });

  it('clamps to the domain start', () => {
    expect(resizeLeftEdge(5000, -100, 0, 100)).toBe(0);
  });

  it('clamps to keep at least the minimum window before `to`', () => {
    expect(resizeLeftEdge(5000, 4990, 0, 100)).toBe(4900);
  });
});

describe('resizeRightEdge', () => {
  it('accepts a valid candidate', () => {
    expect(resizeRightEdge(1000, 4000, 10_000, 100)).toBe(4000);
  });

  it('clamps to the domain end', () => {
    expect(resizeRightEdge(1000, 20_000, 10_000, 100)).toBe(10_000);
  });

  it('clamps to keep at least the minimum window after `from`', () => {
    expect(resizeRightEdge(1000, 1010, 10_000, 100)).toBe(1100);
  });
});

describe('snapToEnd', () => {
  it('snaps within tolerance', () => {
    expect(snapToEnd(394, 400, 6)).toBe(400);
    expect(snapToEnd(400, 400, 6)).toBe(400);
  });

  it('leaves position untouched outside tolerance', () => {
    expect(snapToEnd(380, 400, 6)).toBe(380);
  });
});
