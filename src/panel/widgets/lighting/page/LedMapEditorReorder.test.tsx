// @vitest-environment jsdom
/**
 * Reordering the device chain. dnd-kit cannot be driven in jsdom (it measures
 * with getBoundingClientRect, which is zeroed here), so SortableList is
 * replaced with a stub that exposes onReorder. What is under test is the
 * editor's own handling: that a drag permutes the chain entries, previews
 * them, and that the rows come back in the new order.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { LightingDevice } from '../../../../api/lighting';

const api = vi.hoisted(() => ({
  fetchDeviceStructure: vi.fn(),
  fetchDeviceMap: vi.fn(),
  saveDeviceMap: vi.fn(),
  saveDeviceZones: vi.fn(),
  resetDeviceMap: vi.fn(),
  resetDeviceZones: vi.fn(),
  setDeviceChain: vi.fn(),
  previewDeviceChain: vi.fn(),
  highlightLeds: vi.fn(),
  testLedPattern: vi.fn(),
  clearLedEditor: vi.fn(),
  postLedPreviewLayout: vi.fn(),
  setLightingDeviceColor: vi.fn(),
  setHubComposition: vi.fn(),
  identifyLightingDevice: vi.fn(),
  fetchMappingCatalog: vi.fn(),
  assignBuiltInMapping: vi.fn(),
}));

vi.mock('../../../../api/lighting', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../api/lighting')>();
  return { ...actual, ...api };
});

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (k: string, v?: Record<string, unknown>) => (v ? `${k}:${JSON.stringify(v)}` : k),
    language: 'en',
  }),
}));

const toast = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('../../../../components/common/Toast/Toast', () => ({ useToast: () => toast }));

// The stub: one button per row that moves it one slot later.
vi.mock('../../../../components/common/SortableList/SortableList', () => ({
  SortableList: ({ ids, onReorder, renderRow }: {
    ids: string[];
    onReorder: (next: string[]) => void;
    renderRow: (id: string, args: Record<string, unknown>) => unknown;
  }) => (
    <div>
      <div data-testid="ids">{ids.join('|')}</div>
      <button
        type="button"
        data-testid="swap-first-two"
        onClick={() => onReorder([ids[1], ids[0], ...ids.slice(2)])}
      />
      {ids.map(id => (
        <div key={id}>
          {renderRow(id, {
            ref: () => {},
            style: {},
            attributes: {},
            listeners: {},
            isDragging: false,
            placeholderClassName: '',
          }) as React.ReactNode}
        </div>
      ))}
    </div>
  ),
}));

const portId = 'port-1';
const zones = [
  { id: `${portId}:z0`, name: 'FR12', slices: [{ segment: 0, start: 0, count: 33 }] },
  { id: `${portId}:z1`, name: 'Y50 Solo Fan', slices: [{ segment: 0, start: 33, count: 8 }] },
];
const swapped = [
  { id: `${portId}:z0`, name: 'Y50 Solo Fan', slices: [{ segment: 0, start: 0, count: 8 }] },
  { id: `${portId}:z1`, name: 'FR12', slices: [{ segment: 0, start: 8, count: 33 }] },
];

const structureFor = (zs: typeof zones, chain: { key: string; name: string; ledCount: number }[]) => ({
  id: portId, name: 'ARGB_V2_1', deviceKey: 'k', isDefaultPartition: false,
  segments: [{ index: 0, name: 'ARGB_V2_1', ledCount: 41, resizable: true, zoneType: 'linear' }],
  zones: zs,
  chainable: true,
  chain: chain.map(c => ({ ...c, editableCount: false })),
});
const emptyMap = { id: portId, aspectRatio: 0, segments: [] };
// A populated map, so the divergence check that guards a chain edit has LEDs
// to compare.
const mapFor = (zs: typeof zones, v: number) => ({
  id: portId, aspectRatio: 0,
  segments: [{
    index: 0, name: 'ARGB_V2_1', resizable: true, ledCount: 41,
    leds: zs.flatMap(z => z.slices.flatMap(sl => Array.from({ length: sl.count }, (_, i) => ({
      index: sl.start + i, u: (sl.start + i) / 41, v, disabled: false, zoneId: z.id, isCustom: false,
    })))),
  }],
});

const card = (z: { id: string; name: string }, i: number): LightingDevice => ({
  id: z.id, name: z.name, type: 'ledstrip', iconType: 'strip', ledsOn: true, controlled: true,
  brightness: 100, hue: 0, saturation: 1, ledCount: 33, enabledLedCount: 33,
  canvasX: 0, canvasY: 0, canvasW: 80, canvasH: 60, canvasRotation: 0,
  deviceId: portId, parentDeviceId: 'board', zoneIndex: i, zoneCustomizable: true,
  deviceKey: '', conflictAppIds: [],
} as unknown as LightingDevice);

let LedMapEditor: typeof import('./LedMapEditor').LedMapEditor;

beforeEach(async () => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.fetchDeviceStructure.mockResolvedValue(structureFor(zones, [
    { key: 'product:hyte-fr12', name: 'FR12', ledCount: 33 },
    { key: 'product:hyte-y50-solo', name: 'Y50 Solo Fan', ledCount: 8 },
  ]));
  api.fetchDeviceMap.mockResolvedValue(emptyMap);
  api.fetchMappingCatalog.mockResolvedValue({ items: [], total: 0 });
  api.postLedPreviewLayout.mockResolvedValue(undefined);
  // The swap, as the service would answer it.
  api.previewDeviceChain.mockResolvedValue({
    error: false,
    structure: structureFor(swapped, [
      { key: 'product:hyte-y50-solo', name: 'Y50 Solo Fan', ledCount: 8 },
      { key: 'product:hyte-fr12', name: 'FR12', ledCount: 33 },
    ]),
    map: emptyMap,
  });
  ({ LedMapEditor } = await import('./LedMapEditor'));
});

afterEach(() => { vi.restoreAllMocks(); });

describe('LedMapEditor chain reorder', () => {
  it('previews the permuted chain and shows the rows in the new order', async () => {
    render(
      <LedMapEditor
        deviceId={portId}
        initialZoneId={zones[0].id}
        devices={zones.map(card)}
        zoneCustomizable
        onClose={vi.fn()}
      />,
    );
    await screen.findByText('FR12');
    fireEvent.click(await screen.findByTestId('swap-first-two'));

    // The entries are permuted, not re-sent as they were - and each one keeps
    // the slot it came from, which is what moves its rename with it.
    await waitFor(() => expect(api.previewDeviceChain).toHaveBeenCalledWith(portId, [
      { key: 'product:hyte-y50-solo', fromOrdinal: 1 },
      { key: 'product:hyte-fr12', fromOrdinal: 0 },
    ]));

    // ...and the list shows what came back, rather than snapping back.
    await waitFor(() => {
      const names = Array.from(document.querySelectorAll('[class*="rowName"]')).map(e => e.textContent);
      expect(names.length).toBeGreaterThan(0);
      expect(names).toEqual(['Y50 Solo Fan', 'FR12']);
    });
    // Nothing persisted.
    expect(api.setDeviceChain).not.toHaveBeenCalled();
  });

  it('hands dnd-kit an id list that actually permuted', async () => {
    render(
      <LedMapEditor
        deviceId={portId}
        initialZoneId={zones[0].id}
        devices={zones.map(card)}
        zoneCustomizable
        onClose={vi.fn()}
      />,
    );
    const before = (await screen.findByTestId('ids')).textContent!.split('|');
    fireEvent.click(screen.getByTestId('swap-first-two'));

    // Zone ids are positional, so reordering with those hands dnd-kit back the
    // list it started with and it animates the row home again - the drop then
    // reads as two animations, the second undoing the first.
    await waitFor(() => {
      const after = screen.getByTestId('ids').textContent!.split('|');
      expect(after).toEqual([before[1], before[0]]);
    });
  });

  it('undoes a reorder to the rows and zones it started from', async () => {
    render(
      <LedMapEditor
        deviceId={portId}
        initialZoneId={zones[0].id}
        devices={zones.map(card)}
        zoneCustomizable
        onClose={vi.fn()}
      />,
    );
    await screen.findByText('FR12');
    const names = () => Array.from(document.querySelectorAll('[class*="rowName"]')).map(e => e.textContent);
    fireEvent.click(screen.getByTestId('swap-first-two'));
    await waitFor(() => expect(names()).toEqual(['Y50 Solo Fan', 'FR12']));

    // The rows move before the preview lands; the snapshot has to predate
    // that, or undo restores the moved rows over the original zones.
    fireEvent.click(screen.getByRole('button', { name: 'lighting.ledMap.undo' }));
    await waitFor(() => expect(names()).toEqual(['FR12', 'Y50 Solo Fan']));
    // The next edit posts the disk order, not the undone permutation.
    api.previewDeviceChain.mockClear();
    fireEvent.click(screen.getByTestId('swap-first-two'));
    await waitFor(() => expect(api.previewDeviceChain).toHaveBeenCalledWith(portId, [
      { key: 'product:hyte-y50-solo', fromOrdinal: 1 },
      { key: 'product:hyte-fr12', fromOrdinal: 0 },
    ]));
  });

  it('does not read an undone chain edit as unsaved LED work', async () => {
    api.fetchDeviceMap.mockResolvedValue(mapFor(zones, 0.5));
    api.previewDeviceChain.mockResolvedValue({
      error: false,
      structure: structureFor(swapped, [
        { key: 'product:hyte-y50-solo', name: 'Y50 Solo Fan', ledCount: 8 },
        { key: 'product:hyte-fr12', name: 'FR12', ledCount: 33 },
      ]),
      // Laid out differently from the load, as a real product swap would be.
      map: mapFor(swapped, 0.25),
    });
    render(
      <LedMapEditor
        deviceId={portId}
        initialZoneId={zones[0].id}
        devices={zones.map(card)}
        zoneCustomizable
        onClose={vi.fn()}
      />,
    );
    await screen.findByText('FR12');
    const names = () => Array.from(document.querySelectorAll('[class*="rowName"]')).map(e => e.textContent);
    fireEvent.click(screen.getByTestId('swap-first-two'));
    await waitFor(() => expect(names()).toEqual(['Y50 Solo Fan', 'FR12']));
    fireEvent.click(screen.getByRole('button', { name: 'lighting.ledMap.undo' }));
    await waitFor(() => expect(names()).toEqual(['FR12', 'Y50 Solo Fan']));

    // The LEDs are back to what was loaded, so a second drag previews
    // straight away rather than asking to discard edits that do not exist.
    api.previewDeviceChain.mockClear();
    fireEvent.click(screen.getByTestId('swap-first-two'));
    await waitFor(() => expect(api.previewDeviceChain).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('lighting.ledMap.unsavedTitle')).toBeNull();
  });

  it('puts the rows back when the preview fails', async () => {
    api.previewDeviceChain.mockResolvedValue({ error: true });
    render(
      <LedMapEditor
        deviceId={portId}
        initialZoneId={zones[0].id}
        devices={zones.map(card)}
        zoneCustomizable
        onClose={vi.fn()}
      />,
    );
    await screen.findByText('FR12');
    const names = () => Array.from(document.querySelectorAll('[class*="rowName"]')).map(e => e.textContent);
    fireEvent.click(screen.getByTestId('swap-first-two'));
    await waitFor(() => expect(api.previewDeviceChain).toHaveBeenCalled());
    await waitFor(() => expect(names()).toEqual(['FR12', 'Y50 Solo Fan']));
    expect(screen.getByRole('button', { name: 'lighting.ledMap.undo' })).toBeDisabled();
  });

  it('moves the selection to the slot the selected device landed in', async () => {
    render(
      <LedMapEditor
        deviceId={portId}
        initialZoneId={zones[0].id}
        devices={zones.map(card)}
        zoneCustomizable
        onClose={vi.fn()}
      />,
    );
    // FR12 starts selected at z0; after the swap it sits at z1.
    await screen.findByText('FR12');
    const active = () => document.querySelector('[class*="rowActive"]')?.textContent;
    await waitFor(() => expect(active()).toContain('FR12'));
    fireEvent.click(screen.getByTestId('swap-first-two'));
    await waitFor(() => expect(active()).toContain('FR12'));
  });
});
