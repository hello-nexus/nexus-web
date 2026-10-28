// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { galleryApp } from './index';
import { tryResizeWidget } from '../../engine/panelLayoutOps';
import { freeformSnapSpans } from '../../engine/freeformResize';
import type { PanelLayout } from '../../types';

describe('gallery freeform resizing', () => {
  it('opts in, so it snaps to any span past 4x4 as well as its declared sizes', () => {
    expect(galleryApp.meta.freeform).toBe(true);
    const names = freeformSnapSpans(galleryApp.meta.sizes, { cols: 8, rows: 8 }).map(s => `${s.cols}x${s.rows}`);
    expect(names).toEqual(expect.arrayContaining(['2x2', '2x4', '4x2', '4x4', '5x4', '4x5', '5x5', '6x4', '4x6', '8x8']));
    expect(names).not.toContain('2x2round');
  });

  it('keeps the widget id and config through a resize, so its picked image stays attached', () => {
    const layout: PanelLayout = {
      layoutSchemaVersion: 2,
      surface: 'y70',
      pages: [{ id: 'p1', widgets: [{ id: 'gal-1', type: 'gallery', size: '4x4', col: 0, row: 0, config: { imageId: 'kept' } }] }],
    };
    const next = tryResizeWidget(layout, 'gal-1', '6x4', { gridCols: 8, pageRows: 8 }, 5)!;
    expect(next.pages[0].widgets[0]).toMatchObject({ id: 'gal-1', type: 'gallery', size: '6x4', config: { imageId: 'kept' } });
  });
});
