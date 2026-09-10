import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  { zoneId: 'p:z0', name: 'Generic Fan', ledCount: 12, enabledCount: 12, key: 'generic:fan', editableCount: true },
  { zoneId: 'p:z1', name: 'Corsair QX Fan', ledCount: 34, enabledCount: 30, key: QX.key, editableCount: false },
  { zoneId: 'p:z2', name: 'Generic Strip', ledCount: 30, enabledCount: 30, key: 'generic:strip', editableCount: true },
];
const keeb: ChainRow[] = [
  { zoneId: 'k:keys', name: 'Keys', ledCount: 96, enabledCount: 96, editableCount: false },
  { zoneId: 'k:under', name: 'Underglow', ledCount: 51, enabledCount: 51, editableCount: false },
];

beforeEach(() => {
  vi.clearAllMocks();
  fetchMappingCatalog.mockResolvedValue({ error: false, msg: '', items: [GENERIC_FAN, QX], total: 2 });
});

function setup(rows: ChainRow[], chainable: boolean, over: Partial<Parameters<typeof ZoneChainList>[0]> = {}) {
  const handlers = { onSelect: vi.fn(), onChange: vi.fn(), onAdd: vi.fn(), onRemove: vi.fn() };
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

describe('ZoneChainList on a chainable port', () => {
  it('lists one row per zone by its product name, plus the total', () => {
    setup(port, true);
    expect(screen.getByText('Generic Fan')).toBeTruthy();
    expect(screen.getByText('Corsair QX Fan')).toBeTruthy();
    expect(screen.getByText('Generic Strip')).toBeTruthy();
    expect(total()).toBe('76');
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
    const rows = document.querySelectorAll(`.${styles.row}`);
    expect(rows[1].className).toContain(styles.rowActive);
    expect(rows[2].className).toContain(styles.rowMarked);
    expect(rows[2].className).not.toContain(styles.rowActive);
    expect(rows[0].className).not.toContain(styles.rowMarked);
  });

  it('picks a product for a row from the catalog, with no count of its own', async () => {
    const { onChange } = setup(port, true);
    fireEvent.click(pickButtons()[0]);
    await waitFor(() => expect(fetchMappingCatalog).toHaveBeenCalled());
    fireEvent.click(await screen.findByText(QX.name));
    expect(onChange).toHaveBeenCalledWith(0, { key: QX.key });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('picks a generic for a row at the row\'s current count', async () => {
    const { onChange } = setup(port, true);
    fireEvent.click(pickButtons()[1]);
    fireEvent.click(await screen.findByRole('option', { name: GENERIC_FAN.name }));
    expect(onChange).toHaveBeenCalledWith(1, { key: 'generic:fan', ledCount: 34 });
  });

  it('marks the row\'s current product in the picker and hides a generic\'s count there', async () => {
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

  it('removes a row', () => {
    const { onRemove } = setup(port, true);
    fireEvent.click(screen.getAllByRole('button', { name: 'lighting.ledMap.chainRemove' })[2]);
    expect(onRemove).toHaveBeenCalledWith(2);
  });

  it('keeps the last row: a port always has a zone', () => {
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
  it('renders every row read-only with its count and the total', () => {
    setup(keeb, false);
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

  it('still selects a zone from its row', () => {
    const { onSelect } = setup(keeb, false);
    fireEvent.click(screen.getByText('Underglow'));
    expect(onSelect).toHaveBeenCalledWith('k:under', false);
  });

  it('renders the zone tools it is given', () => {
    setup(keeb, false, { actions: <button type="button">tool</button> });
    expect(screen.getByText('tool')).toBeTruthy();
  });
});
