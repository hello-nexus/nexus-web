// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { normalizePanelLayout } from './usePanelLayout';
import { repaginatePanelLayout } from './paginate';
import { sizeToSpan } from './grid';
import type { PanelLayout, PanelWidget } from '../types';
import {
  _resetMarketplaceRegistryForTests,
  _seedMarketplaceRegistryForTests,
  loadMarketplaceApps,
} from '../../widgets/marketplaceRegistry';
import { listInstalledApps } from '../../widgets/api';

vi.mock('../../widgets/api', () => ({ listInstalledApps: vi.fn() }));
const mockList = vi.mocked(listInstalledApps);

const INA_TYPE = 'app:com.hellonexus.ina';

const OTHER_APP = {
  id: 'com.hellonexus.aquarium', name: 'Aquarium', version: '1.0.0',
  surfaces: ['y70'], runtime: 'sdk', page: false,
  capabilities: {}, sizes: ['2x2'], defaultSize: '2x2',
  source: 'user', preinstalled: false,
};

function widget(overrides: Partial<PanelWidget> & Pick<PanelWidget, 'id' | 'type' | 'size'>): PanelWidget {
  return {
    col: 0,
    row: 0,
    ...overrides,
  };
}

function layout(widgets: PanelWidget[]): PanelLayout {
  return {
    layoutSchemaVersion: 2,
    surface: 'y70',
    pages: [{ id: 'p1', widgets }],
  };
}

describe('normalizePanelLayout registry reconciliation', () => {
  it('drops widgets whose type is not in the registry', () => {
    const result = normalizePanelLayout(
      layout([
        widget({ id: 'a', type: 'cooling', size: '2x2' }),
        widget({ id: 'b', type: 'does-not-exist', size: '2x2' }),
      ]),
      'y70',
    );
    expect(result.pages[0].widgets.map(w => w.id)).toEqual(['a']);
  });

  it('drops widgets that are not supported on the current surface', () => {
    // lighting is touch-only, so it's never available on q60 (q60 has
    // 2x4 but is not touch). Canonical "unsupported on q60" example.
    const result = normalizePanelLayout(
      layout([widget({ id: 'a', type: 'lighting', size: '2x2' })]),
      'q60',
    );
    expect(result.pages[0].widgets).toHaveLength(0);
  });

  it('drops panel-only widgets already placed on a desktop layout, keeping them on panels', () => {
    // Dashboards saved before snake/blocks became panelOnly still carry the
    // tiles; the reconcile clears them so an inert tile can't survive.
    const games = [
      widget({ id: 'a', type: 'clock', size: '2x2' }),
      widget({ id: 'b', type: 'snake', size: '2x2' }),
      widget({ id: 'c', type: 'blocks', size: '2x2' }),
    ];
    expect(normalizePanelLayout(layout(games), 'desktop').pages[0].widgets.map(w => w.id))
      .toEqual(['a']);
    expect(normalizePanelLayout(layout(games), 'y70').pages[0].widgets.map(w => w.id))
      .toEqual(['a', 'b', 'c']);
  });

  it('snaps a widget whose size is not in meta.sizes to the nearest allowed size', () => {
    // timer allows ['2x2', '4x2'] - 4x4 should snap down to 4x2 (same area).
    const result = normalizePanelLayout(
      layout([widget({ id: 'a', type: 'timer', size: '4x4' })]),
      'y70',
    );
    expect(result.pages[0].widgets[0].size).toBe('4x2');
  });

  it('preserves a widget whose size is already in meta.sizes', () => {
    const result = normalizePanelLayout(
      layout([widget({ id: 'a', type: 'cooling', size: '2x2' })]),
      'y70',
    );
    expect(result.pages[0].widgets[0].size).toBe('2x2');
    // Stable identity keeps repaginate's same-reference fixed point intact
    expect(result.pages[0].widgets[0].id).toBe('a');
  });

  it('is idempotent: re-normalizing produces the same layout shape', () => {
    const once = normalizePanelLayout(
      layout([
        widget({ id: 'a', type: 'cooling', size: '4x4' }),
        widget({ id: 'b', type: 'does-not-exist', size: '2x2' }),
      ]),
      'y70',
    );
    const twice = normalizePanelLayout(once, 'y70');
    expect(twice.pages[0].widgets).toEqual(once.pages[0].widgets);
  });

  it('leaves geometry untouched when a size snap introduces overlap', () => {
    // monitoring at 2x4 sits at (0, 0); a 2x2 sibling at (2, 0) fits
    // beside it without overlap. On y70 the 2x4 size is reserved for
    // single-widget surfaces, so reconcile snaps it to 4x2, which
    // overlaps the sibling at cols 2-3 / rows 0-1. Normalize is
    // geometry-neutral: positions are preserved and the overlap stands,
    // for repaginatePanelLayout to repair at the real grid capacity.
    const result = normalizePanelLayout(
      layout([
        widget({ id: 'mon', type: 'monitoring', size: '2x4', col: 0, row: 0 }),
        widget({ id: 'sib', type: 'cooling',    size: '2x2', col: 2, row: 0 }),
      ]),
      'y70',
    );
    const shapes = result.pages[0].widgets.map(w => ({ id: w.id, size: w.size, col: w.col, row: w.row }));
    expect(shapes).toEqual([
      { id: 'mon', size: '4x2', col: 0, row: 0 },
      { id: 'sib', size: '2x2', col: 2, row: 0 },
    ]);
  });

  it('repaginatePanelLayout repairs the snap overlap at the real capacity', () => {
    const normalized = normalizePanelLayout(
      layout([
        widget({ id: 'mon', type: 'monitoring', size: '2x4', col: 0, row: 0 }),
        widget({ id: 'sib', type: 'cooling',    size: '2x2', col: 2, row: 0 }),
      ]),
      'y70',
    );
    const repaired = repaginatePanelLayout(normalized, { gridCols: 4, pageRows: 16 });
    const rects = repaired.pages[0].widgets.map(w => {
      const span = sizeToSpan(w.size);
      return { left: w.col, right: w.col + span.cols, top: w.row, bottom: w.row + span.rows };
    });
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        expect(overlap, `widgets ${i} and ${j} overlap`).toBe(false);
      }
    }
  });
});

describe('normalizePanelLayout immersive-on-load mark', () => {
  it('keeps a mark on a first-page widget', () => {
    const result = normalizePanelLayout(
      { ...layout([widget({ id: 'a', type: 'media', size: '2x2' })]), immersiveOnLoadWidgetId: 'a' },
      'y70',
    );
    expect(result.immersiveOnLoadWidgetId).toBe('a');
  });

  it('drops a mark whose widget the reconcile removed', () => {
    const result = normalizePanelLayout(
      { ...layout([widget({ id: 'a', type: 'does-not-exist', size: '2x2' })]), immersiveOnLoadWidgetId: 'a' },
      'y70',
    );
    expect(result.immersiveOnLoadWidgetId).toBeUndefined();
  });

  it('keeps a mark on a widget that sits on a later page, so moving it home restores it', () => {
    // A resize cascade or a drag can push the marked widget off page 1. The mark
    // is inert there (resolveImmersiveOnLoadWidget ignores it), so dropping it
    // here would destroy the setting for a move the user can undo.
    const result = normalizePanelLayout(
      {
        layoutSchemaVersion: 2,
        surface: 'y70',
        pages: [
          { id: 'p1', widgets: [widget({ id: 'a', type: 'media', size: '2x2' })] },
          { id: 'p2', widgets: [widget({ id: 'b', type: 'media', size: '2x2' })] },
        ],
        immersiveOnLoadWidgetId: 'b',
      },
      'y70',
    );
    expect(result.immersiveOnLoadWidgetId).toBe('b');
  });

  it('keeps a mark on a surface with no immersive mode rather than clear it', () => {
    // deviceTouch arrives after the first normalize on a promoted monitor, so a
    // capability-gated clear would persist the loss in that window.
    const result = normalizePanelLayout(
      { ...layout([widget({ id: 'a', type: 'media', size: '2x2' })]), immersiveOnLoadWidgetId: 'a' },
      'monitor',
    );
    expect(result.immersiveOnLoadWidgetId).toBe('a');
  });
});

// An app installs while a panel is live, so its registry read predates the
// install. Dropping the placement on that read is what left the auto-installed
// Ina widget off the Y70 until the page reloaded.
describe('normalizePanelLayout app placements against an expired registry', () => {
  beforeEach(() => _resetMarketplaceRegistryForTests());
  afterEach(() => { _resetMarketplaceRegistryForTests(); vi.useRealTimers(); vi.clearAllMocks(); });

  const inaLayout = () => layout([widget({ id: 'a', type: INA_TYPE, size: '4x4' })]);

  it('keeps an unresolved app placement once the registry read has expired', () => {
    _seedMarketplaceRegistryForTests([OTHER_APP] as never);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 31_000);

    expect(normalizePanelLayout(inaLayout(), 'y70').pages[0].widgets.map(w => w.type)).toEqual([INA_TYPE]);
  });

  it('drops an unresolved app placement while the read is current', () => {
    _seedMarketplaceRegistryForTests([OTHER_APP] as never);

    expect(normalizePanelLayout(inaLayout(), 'y70').pages[0].widgets).toEqual([]);
  });

  // An empty listing is an answer, not an unknown: holding the placement here
  // would leave a blank cell at its full span on a machine with no apps.
  it('drops it against a current read that lists nothing', async () => {
    mockList.mockResolvedValue([] as never);
    await loadMarketplaceApps();

    expect(normalizePanelLayout(inaLayout(), 'y70').pages[0].widgets).toEqual([]);
  });

  it('keeps a placement the current registry resolves', () => {
    _seedMarketplaceRegistryForTests([{ ...OTHER_APP, id: 'com.hellonexus.ina', name: 'Ina' }] as never);

    expect(normalizePanelLayout(layout([widget({ id: 'a', type: INA_TYPE, size: '2x2' })]), 'y70')
      .pages[0].widgets.map(w => w.type)).toEqual([INA_TYPE]);
  });
});
