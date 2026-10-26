import { describe, expect, it } from 'vitest';
import type { PanelDeviceRecord } from '../../api/panel';
import { panelGridCapacityForCanvas } from './grid';
import { monitorGridCapacity, recordCanvasOf } from './recordCanvas';

const record = (over: Partial<PanelDeviceRecord>) => ({ displayId: 'd1', capabilities: { surface: 'monitor', cssWidth: 1920, cssHeight: 1200, dpr: 1, dpi: 94.1 }, ...over }) as PanelDeviceRecord;

describe('recordCanvasOf', () => {
  it('prefers the size the kiosk reported over the display capabilities', () => {
    expect(recordCanvasOf(record({ kioskViewport: { cssWidth: 1920, cssHeight: 1152, dpr: 1 } }))).toEqual({ width: 1920, height: 1152, dpr: 1 });
    expect(recordCanvasOf(record({}))).toEqual({ width: 1920, height: 1200, dpr: 1 });
    expect(recordCanvasOf(null)).toBeNull();
  });

  it('gives the editor and the kiosk the same grid for the same record, including a work area shorter than the display', () => {
    const rec = record({ kioskViewport: { cssWidth: 1920, cssHeight: 1152, dpr: 1 } });
    const canvas = recordCanvasOf(rec)!;
    const editor = monitorGridCapacity(canvas, canvas.dpr, 94.1, 0.08);
    // The kiosk measures its own window and sizes through panelGridCapacityForCanvas.
    const kiosk = panelGridCapacityForCanvas(1920, 1152, { surface: 'monitor', dpi: 94.1, paddingRatio: 0.08 });
    expect(editor).toEqual({ gridCols: kiosk.columns, pageRows: kiosk.rows });
    expect(editor.gridCols).toBe(20);
    const stale = recordCanvasOf(record({}))!;
    expect(monitorGridCapacity(stale, stale.dpr, 94.1, 0.08).gridCols).not.toBe(editor.gridCols);
  });
});
