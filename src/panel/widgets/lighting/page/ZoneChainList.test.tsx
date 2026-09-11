import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZoneChainList, type ChainRow } from './ZoneChainList';
import styles from './ZoneChainList.module.scss';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}));

vi.mock('../../../../components/common/SearchInput/SearchInput', () => ({
  SearchInput: ({ value, onChange, ariaLabel }: {
    value: string; onChange: (v: string) => void; ariaLabel?: string;
  }) => (
    <input aria-label={ariaLabel} value={value} onChange={e => onChange(e.target.value)} />
  ),
}));

const fetchMappingCatalog = vi.fn();
vi.mock('../../../../api/lighting', () => ({
  fetchMappingCatalog: (...a: unknown[]) => fetchMappingCatalog(...a),
}));

const QX = { key: 'product:corsair-qx-fan', name: 'iCUE LINK QX RGB', brand: 'Corsair', type: 'Fan', ledCount: 34, parametric: false };
const GENERIC_FAN = { key: 'generic:fan', name: 'Generic Fan', brand: '', type: 'Fan', ledCount: 0, parametric: true };

// The T1 port: a generic fan, a product, a generic strip.
const port: ChainRow[] = [
  { zoneId: 'p:z0', rowKey: 'p:z0', name: 'Generic Fan', ledCount: 12, enabledCount: 12, key: 'generic:fan', editableCount: true },
  { zoneId: 'p:z1', rowKey: 'p:z1', name: 'Corsair QX Fan', ledCount: 34, enabledCount: 30, key: QX.key, editableCount: false },
  { zoneId: 'p:z2', rowKey: 'p:z2', name: 'Generic Strip', ledCount: 30, enabledCount: 30, key: 'generic:strip', editableCount: true },
];
// A resizable zone on a device that carries no chain (NP50 / Q-series shape):
// the row's count IS the hardware zone size.
const resizableZone: ChainRow[] = [
  { zoneId: 'np50:z0', rowKey: 'np50:z0', name: 'NP50', ledCount: 30, enabledCount: 30, editableCount: true, resizable: true },
];
const keeb: ChainRow[] = [
  { zoneId: 'k:keys', rowKey: 'k:keys', name: 'Keys', ledCount: 96, enabledCount: 96, editableCount: false },
  { zoneId: 'k:under', rowKey: 'k:under', name: 'Underglow', ledCount: 51, enabledCount: 51, editableCount: false },
];

const CATALOG = [GENERIC_FAN, QX];
const RECENTS_KEY = 'lighting.ledMap.recentProducts';
const storedRecents = () => (JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]') as { key: string }[]).map(r => r.key);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  // Empty query: the catalog head. A name query: the rows containing it.
  fetchMappingCatalog.mockImplementation((query: string) => Promise.resolve({
    error: false, msg: '', total: CATALOG.length,
    items: query ? CATALOG.filter(i => i.name.toLowerCase().includes(query.toLowerCase())) : CATALOG,
  }));
});
afterEach(() => { vi.restoreAllMocks(); });

function setup(rows: ChainRow[], chainable: boolean, over: Partial<Parameters<typeof ZoneChainList>[0]> = {}) {
  const handlers = { onSelect: vi.fn(), onChange: vi.fn(), onAdd: vi.fn(), onRemove: vi.fn(), onResize: vi.fn(), onReorder: vi.fn() };
  render(
    <ZoneChainList
      rows={rows}
      chainable={chainable}
      selectedZoneId={rows[0].zoneId}
      markedIds={new Set([rows[0].zoneId])}
      {...handlers}
      {...over}
    />,
  );
  return handlers;
}

const total = () => document.querySelector(`.${styles.totalCount}`)?.textContent;
const countInputs = () => document.querySelectorAll<HTMLInputElement>(`.${styles.zoneCountInput}`);
const pickButtons = () => screen.queryAllByRole('button', { name: 'lighting.ledMap.assignDevice' });
const dragHandles = () => document.querySelectorAll(`.${styles.dragHandle}`);

describe('ZoneChainList on a chainable port', () => {
  it('lists one chip per zone by its product name under a Devices header, plus the total', () => {
    setup(port, true);
    expect(screen.getByText('lighting.rightPane.devices')).toBeTruthy();
    expect(screen.getByText('Generic Fan')).toBeTruthy();
    expect(screen.getByText('Corsair QX Fan')).toBeTruthy();
    expect(screen.getByText('Generic Strip')).toBeTruthy();
    expect(total()).toBe('76');
  });

  it('lists the rows top to bottom in wire order, with a drag handle on each, then the add button and total in the footer', () => {
    setup(port, true);
    const list = document.querySelectorAll(`.${styles.list}`);
    expect(list).toHaveLength(1);
    const names = Array.from(list[0].querySelectorAll(`.${styles.rowName}`)).map(el => el.textContent);
    expect(names).toEqual(['Generic Fan', 'Corsair QX Fan', 'Generic Strip']);
    expect(dragHandles()).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'lighting.ledMap.chainAdd' })).toBeTruthy();
    expect(total()).toBe('76');
  });

  it('hides the drag handle when the port has only one entry', () => {
    setup([port[1]], true);
    expect(dragHandles()).toHaveLength(0);
  });

  it('names each drag handle after its row, for keyboard and screen-reader reordering', () => {
    setup(port, true);
    expect(screen.getByRole('button', { name: 'lighting.ledMap.chainReorder:{"name":"Corsair QX Fan"}' })).toBeTruthy();
  });

  it('wires the real dnd-kit sortable role onto the row root, with the handle as its own focusable control', () => {
    setup(port, true);
    const rowEls = document.querySelectorAll(`.${styles.row}`);
    expect(rowEls[0].getAttribute('role')).toBe('button');
    expect(rowEls[0].getAttribute('tabindex')).toBe('0');
    const handle = dragHandles()[0];
    expect(handle.tagName).toBe('BUTTON');
    expect(handle.getAttribute('data-drag-handle')).toBe('true');
  });

  it('locks a product count to the enabled/total readout and types a generic count', () => {
    setup(port, true);
    expect(screen.getByText('30/34')).toBeTruthy();
    const inputs = countInputs();
    expect(inputs).toHaveLength(2);
    expect(inputs[0].value).toBe('12');
    expect(inputs[1].value).toBe('30');
  });

  it('selects a zone from its name, additively with the modifier', () => {
    const { onSelect } = setup(port, true);
    fireEvent.click(screen.getByText('Corsair QX Fan'));
    expect(onSelect).toHaveBeenCalledWith('p:z1', false);
    fireEvent.click(screen.getByText('Generic Fan'), { metaKey: true, ctrlKey: true });
    expect(onSelect).toHaveBeenLastCalledWith('p:z0', true);
  });

  it('marks the active and merge-marked rows', () => {
    setup(port, true, { selectedZoneId: 'p:z1', markedIds: new Set(['p:z1', 'p:z2']) });
    const rowEls = document.querySelectorAll(`.${styles.row}`);
    expect(rowEls[1].className).toContain(styles.rowActive);
    expect(rowEls[2].className).toContain(styles.rowMarked);
    expect(rowEls[2].className).not.toContain(styles.rowActive);
    expect(rowEls[0].className).not.toContain(styles.rowMarked);
  });

  it('picks a product for a chip from the catalog, with no count of its own', async () => {
    const { onChange } = setup(port, true);
    fireEvent.click(pickButtons()[0]);
    await waitFor(() => expect(fetchMappingCatalog).toHaveBeenCalled());
    fireEvent.click(await screen.findByText(QX.name));
    expect(onChange).toHaveBeenCalledWith(0, { key: QX.key });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('picks a generic for a chip at the chip\'s current count', async () => {
    const { onChange } = setup(port, true);
    fireEvent.click(pickButtons()[1]);
    fireEvent.click(await screen.findByRole('option', { name: GENERIC_FAN.name }));
    expect(onChange).toHaveBeenCalledWith(1, { key: 'generic:fan', ledCount: 34 });
  });

  it('marks the chip\'s current product in the picker and hides a generic\'s count there', async () => {
    setup(port, true);
    fireEvent.click(pickButtons()[1]);
    const current = await screen.findByRole('option', { name: new RegExp(QX.name) });
    expect(current.getAttribute('aria-selected')).toBe('true');
    expect(current.textContent).toContain('assignLeds');
    expect(screen.getByRole('option', { name: GENERIC_FAN.name }).textContent).not.toContain('assignLeds');
  });

  it('commits a retyped generic count on Enter, clamped, and reverts on Escape', () => {
    const { onChange } = setup(port, true);
    const input = countInputs()[0];
    fireEvent.change(input, { target: { value: '5000' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(0, { key: 'generic:fan', ledCount: 1024 });

    fireEvent.change(input, { target: { value: '7' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('12');
  });

  it('does not re-post an unchanged count', () => {
    const { onChange } = setup(port, true);
    fireEvent.blur(countInputs()[0]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes a chip', () => {
    const { onRemove } = setup(port, true);
    fireEvent.click(screen.getAllByRole('button', { name: 'lighting.ledMap.chainRemove' })[2]);
    expect(onRemove).toHaveBeenCalledWith(2);
  });

  it('keeps the last chip: a port always has a zone', () => {
    setup([port[1]], true);
    expect(screen.queryByRole('button', { name: 'lighting.ledMap.chainRemove' })).toBeNull();
  });

  it('adds a product from the add picker', async () => {
    const { onAdd } = setup(port, true);
    fireEvent.click(screen.getByRole('button', { name: 'lighting.ledMap.chainAdd' }));
    fireEvent.click(await screen.findByText(QX.name));
    expect(onAdd).toHaveBeenCalledWith({ key: QX.key });
  });

  it('adds a generic only once its count is typed', async () => {
    const { onAdd } = setup(port, true);
    fireEvent.click(screen.getByRole('button', { name: 'lighting.ledMap.chainAdd' }));
    fireEvent.click(await screen.findByRole('option', { name: GENERIC_FAN.name }));
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getAllByText('Generic Fan')).toHaveLength(2);
    expect(document.querySelectorAll(`.${styles.rowPending}`)).toHaveLength(1);
    const pending = countInputs()[2];
    expect(pending.value).toBe('');
    fireEvent.change(pending, { target: { value: '16' } });
    fireEvent.keyDown(pending, { key: 'Enter' });
    fireEvent.blur(pending);
    expect(onAdd).toHaveBeenCalledWith({ key: 'generic:fan', ledCount: 16 });
  });

  it('drops a pending generic on Escape', async () => {
    const { onAdd } = setup(port, true);
    fireEvent.click(screen.getByRole('button', { name: 'lighting.ledMap.chainAdd' }));
    fireEvent.click(await screen.findByRole('option', { name: GENERIC_FAN.name }));
    fireEvent.keyDown(countInputs()[2], { key: 'Escape' });
    expect(countInputs()).toHaveLength(2);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('closes the picker on Escape without closing anything above it', async () => {
    setup(port, true);
    fireEvent.click(pickButtons()[0]);
    await screen.findByRole('listbox');
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    const stop = vi.spyOn(escape, 'stopPropagation');
    document.body.dispatchEvent(escape);
    expect(stop).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
  });
});

describe('ZoneChainList on a device with fixed zones', () => {
  it('renders every zone read-only with its count and the total, and no drag handle', () => {
    setup(keeb, false);
    expect(screen.getByText('lighting.rightPane.devices')).toBeTruthy();
    expect(dragHandles()).toHaveLength(0);
    expect(screen.getByText('Keys')).toBeTruthy();
    expect(screen.getByText('Underglow')).toBeTruthy();
    expect(screen.getByText('96')).toBeTruthy();
    expect(screen.getByText('51')).toBeTruthy();
    expect(total()).toBe('147');
    expect(pickButtons()).toHaveLength(0);
    expect(countInputs()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'lighting.ledMap.chainAdd' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'lighting.ledMap.chainRemove' })).toBeNull();
  });

  it('still selects a zone from its chip', () => {
    const { onSelect } = setup(keeb, false);
    fireEvent.click(screen.getByText('Underglow'));
    expect(onSelect).toHaveBeenCalledWith('k:under', false);
  });

  it('renders the zone tools it is given', () => {
    setup(keeb, false, { actions: <button type="button">tool</button> });
    expect(screen.getByText('tool')).toBeTruthy();
  });
});

// The last few picks lead the picker so a chain of the same fan is one click
// per link rather than a search per link.
describe('ZoneChainList recent picks', () => {
  const openAddPicker = () => fireEvent.click(screen.getByRole('button', { name: 'lighting.ledMap.chainAdd' }));
  const recentRows = () => {
    const heading = screen.queryByText('search.section.recent');
    if (!heading) return [];
    const rows: string[] = [];
    let el = heading.nextElementSibling;
    while (el && el.getAttribute('role') === 'option') { rows.push(el.textContent ?? ''); el = el.nextElementSibling; }
    return rows;
  };

  it('shows recent picks above the results while the box is empty, and drops them once the user types', async () => {
    localStorage.setItem(RECENTS_KEY, JSON.stringify([QX]));
    setup(port, true);
    openAddPicker();
    await screen.findByText('search.section.recent');
    expect(recentRows()).toHaveLength(1);
    expect(recentRows()[0]).toContain(QX.name);
    // Once in the recents and once in the catalog head, as ordinary rows; the
    // head arrives after the debounced search, so wait for it.
    await waitFor(() => expect(screen.getAllByRole('option', { name: new RegExp(QX.name) })).toHaveLength(2));
    fireEvent.change(screen.getByLabelText('lighting.ledMap.assignSearch'), { target: { value: 'qx' } });
    await waitFor(() => expect(screen.queryByText('search.section.recent')).toBeNull());
  });

  it('records a pick at the front without duplicating it', async () => {
    localStorage.setItem(RECENTS_KEY, JSON.stringify([GENERIC_FAN, QX]));
    setup(port, true);
    openAddPicker();
    fireEvent.click(await screen.findAllByRole('option', { name: new RegExp(QX.name) }).then(r => r[r.length - 1]));
    expect(storedRecents()).toEqual([QX.key, GENERIC_FAN.key]);
    openAddPicker();
    fireEvent.click(await screen.findAllByRole('option', { name: new RegExp(QX.name) }).then(r => r[r.length - 1]));
    expect(storedRecents()).toEqual([QX.key, GENERIC_FAN.key]);
  });

  it('keeps the newest three', async () => {
    localStorage.setItem(RECENTS_KEY, JSON.stringify([
      { ...QX, key: 'product:a', name: 'A' }, { ...QX, key: 'product:b', name: 'B' }, { ...QX, key: 'product:c', name: 'C' },
    ]));
    setup(port, true);
    openAddPicker();
    fireEvent.click(await screen.findByRole('option', { name: GENERIC_FAN.name }));
    expect(storedRecents()).toEqual([GENERIC_FAN.key, 'product:a', 'product:b']);
  });

  it('drops a recent the catalog no longer lists, and keeps a generic without asking', async () => {
    localStorage.setItem(RECENTS_KEY, JSON.stringify([{ ...QX, key: 'product:gone', name: 'Old Fan' }, GENERIC_FAN]));
    setup(port, true);
    openAddPicker();
    await screen.findByText('search.section.recent');
    expect(recentRows()).toEqual([GENERIC_FAN.name]);
    expect(screen.queryByText('Old Fan')).toBeNull();
  });

  it('renders the plain results when storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    setup(port, true);
    openAddPicker();
    await screen.findByRole('option', { name: GENERIC_FAN.name });
    expect(screen.queryByText('search.section.recent')).toBeNull();
  });
});

describe('ZoneChainList on a resizable zone that carries no chain', () => {
  it('types the count and commits it as a resize, not as a chain entry', () => {
    const h = setup(resizableZone, false);
    const input = countInputs()[0];
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { value: '42' } });
    fireEvent.blur(input);
    // NP50 / MiniHub ports 1-2 / Q-series are resizable but not partitionable,
    // so they carry no chain and this row is the only LED-count field left.
    expect(h.onResize).toHaveBeenCalledWith(0, 42);
    expect(h.onChange).not.toHaveBeenCalled();
  });
});
