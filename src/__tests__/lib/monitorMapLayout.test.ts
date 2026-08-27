// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { TopologyDisplay } from '../../api/displays';
import { displayNumberLabel, layoutMonitorRects } from '../../components/views/DisplaysView/monitorMapLayout';

function display(partial: Partial<TopologyDisplay> & { id: string }): TopologyDisplay {
  return {
    number: 0,
    name: 'Display',
    manufacturer: '',
    model: '',
    bounds: { x: 0, y: 0, width: 2560, height: 1440 },
    resolution: { width: 2560, height: 1440 },
    scaleFactor: 1,
    dpi: null,
    isPrimary: false,
    isInternal: false,
    isY70: false,
    hostingSupported: true,
    assignedPanelDeviceId: null,
    assignedPanelName: null,
    ...partial,
  };
}

describe('layoutMonitorRects', () => {
  it('fits and centers the virtual-desktop bounding box', () => {
    const rects = layoutMonitorRects(
      [
        display({ id: 'a', bounds: { x: 0, y: 0, width: 2560, height: 1440 } }),
        display({ id: 'b', bounds: { x: 2560, y: 0, width: 2560, height: 1440 } }),
      ],
      800,
      400,
      24,
    );

    expect(rects).toHaveLength(2);
    // bbox 5120x1440 in a 752x352 inner box -> scale limited by width.
    const scale = 752 / 5120;
    expect(rects[0].width).toBeCloseTo(2560 * scale - 4, 5);
    // Vertically centered: top offset equals (innerH - bboxH*scale)/2 + padding.
    const expectedTop = 24 + (352 - 1440 * scale) / 2 + 2;
    expect(rects[0].top).toBeCloseTo(expectedTop, 5);
    expect(rects[1].top).toBeCloseTo(expectedTop, 5);
  });

  it('handles negative origins (monitor left of primary)', () => {
    const rects = layoutMonitorRects(
      [
        display({ id: 'left', bounds: { x: -1920, y: 0, width: 1920, height: 1080 } }),
        display({ id: 'right', bounds: { x: 0, y: 0, width: 1920, height: 1080 } }),
      ],
      400,
      300,
    );

    expect(rects[0].left).toBeLessThan(rects[1].left);
    expect(rects[0].left).toBeGreaterThanOrEqual(0);
  });

  it('keeps adjacent monitors adjacent up to the seam inset', () => {
    const rects = layoutMonitorRects(
      [
        display({ id: 'a', bounds: { x: 0, y: 0, width: 1000, height: 1000 } }),
        display({ id: 'b', bounds: { x: 1000, y: 0, width: 1000, height: 1000 } }),
      ],
      500,
      500,
    );

    // Right edge of a (+inset) meets left edge of b (-inset): 4px seam total.
    expect(rects[1].left - (rects[0].left + rects[0].width)).toBeCloseTo(4, 5);
  });

  it('preserves aspect ratio (portrait monitor stays portrait)', () => {
    const rects = layoutMonitorRects(
      [display({ id: 'p', bounds: { x: 0, y: 0, width: 1100, height: 3840 } })],
      600,
      400,
    );

    expect(rects[0].height).toBeGreaterThan(rects[0].width);
    expect((rects[0].height + 4) / (rects[0].width + 4)).toBeCloseTo(3840 / 1100, 3);
  });

  it('falls back to a centered row when any bounds are null', () => {
    const rects = layoutMonitorRects(
      [
        display({ id: 'a', bounds: null, resolution: { width: 2560, height: 1440 } }),
        display({ id: 'b', bounds: { x: 0, y: 0, width: 1920, height: 1080 }, resolution: { width: 1920, height: 1080 } }),
      ],
      800,
      400,
    );

    expect(rects).toHaveLength(2);
    // Same vertical center, laid left-to-right with a gap.
    expect(rects[0].top).toBeCloseTo(rects[1].top, 5);
    expect(rects[1].left).toBeGreaterThan(rects[0].left + rects[0].width);
  });

  it('returns empty for empty input or degenerate containers', () => {
    expect(layoutMonitorRects([], 800, 400)).toEqual([]);
    expect(layoutMonitorRects([display({ id: 'a' })], 0, 400)).toEqual([]);
  });
});

describe('displayNumberLabel', () => {
  it('prefers the OS number and falls back to array order', () => {
    expect(displayNumberLabel(display({ id: 'a', number: 3 }), 0)).toBe('3');
    expect(displayNumberLabel(display({ id: 'a', number: 0 }), 1)).toBe('2');
  });
});
