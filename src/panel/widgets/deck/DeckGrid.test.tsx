import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DeckGrid } from './DeckGrid';
import type { DeckSlot } from './types';
import styles from './DeckGrid.module.scss';

vi.mock('../common/AppPicker', () => ({ useAppIcon: () => null }));

describe('DeckGrid backCell (physical folder views)', () => {
  it('renders every slot with no leading cell when backCell is absent (touch widget path, unchanged)', () => {
    const slots: DeckSlot[] = [{ label: 'a' }, { label: 'b' }];
    const { container } = render(
      <DeckGrid slots={slots} cols={2} rows={1} selectable={false} onCell={() => {}} />,
    );
    const cells = container.querySelectorAll('[data-deck-slot-index]');
    expect(cells).toHaveLength(2);
    expect(cells[0].getAttribute('data-deck-slot-index')).toBe('0');
    expect(cells[1].getAttribute('data-deck-slot-index')).toBe('1');
  });

  it('reserves a leading Back cell distinct from the indexed slots when backCell is set', () => {
    const slots: DeckSlot[] = [{ label: 'a' }, { label: 'b' }];
    const onBack = vi.fn();
    const { container } = render(
      <DeckGrid
        slots={slots}
        cols={3}
        rows={1}
        selectable={false}
        onCell={() => {}}
        backCell={{ onBack, ariaLabel: 'Back' }}
      />,
    );
    // The two real slots keep their own indices; the Back cell is a separate,
    // non-indexed button ahead of them.
    const indexed = container.querySelectorAll('[data-deck-slot-index]');
    expect(indexed).toHaveLength(2);
    const backButton = container.querySelector('button[aria-label="Back"]')!;
    expect(backButton).not.toBeNull();
    expect(backButton.hasAttribute('data-deck-slot-index')).toBe(false);

    fireEvent.click(backButton);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('onCell receives the logical slot index, unaffected by the Back cell taking the first grid position', () => {
    const slots: DeckSlot[] = [{ label: 'a' }, { label: 'b' }];
    const onCell = vi.fn();
    const { container } = render(
      <DeckGrid
        slots={slots}
        cols={3}
        rows={1}
        selectable
        onCell={onCell}
        backCell={{ onBack: () => {}, ariaLabel: 'Back' }}
      />,
    );
    fireEvent.click(container.querySelector('[data-deck-slot-index="1"]')!);
    expect(onCell).toHaveBeenCalledWith(1);
  });
});

describe('DeckGrid cell border rules', () => {
  it('a populated, unselected cell gets no border class at all', () => {
    const slots: DeckSlot[] = [{ action: { type: 'hotkey', keys: '' } }];
    const { container } = render(
      <DeckGrid slots={slots} cols={1} rows={1} selectable onCell={() => {}} selectedIndex={-1} />,
    );
    const cell = container.querySelector('[data-deck-slot-index="0"]')!;
    expect(cell.className).not.toContain(styles.empty);
    expect(cell.className).not.toContain(styles.selected);
  });

  it('a blank slot gets the dashed empty border regardless of selection', () => {
    const slots: DeckSlot[] = [{}];
    const { container } = render(
      <DeckGrid slots={slots} cols={1} rows={1} selectable selectedIndex={0} onCell={() => {}} />,
    );
    const cell = container.querySelector('[data-deck-slot-index="0"]')!;
    expect(cell.className).toContain(styles.empty);
  });

  it('the selected cell gets the selected ring class; other cells do not', () => {
    const slots: DeckSlot[] = [{ label: 'a' }, { label: 'b' }];
    const { container } = render(
      <DeckGrid slots={slots} cols={2} rows={1} selectable selectedIndex={1} onCell={() => {}} />,
    );
    const first = container.querySelector('[data-deck-slot-index="0"]')!;
    const second = container.querySelector('[data-deck-slot-index="1"]')!;
    expect(first.className).not.toContain(styles.selected);
    expect(second.className).toContain(styles.selected);
  });
});

describe('DeckGrid monitoring cell', () => {
  it('renders the live tile (never the icon wrapper) for a monitoring slot', () => {
    const slots: DeckSlot[] = [{
      action: { type: 'monitoring', category: 'cpu', sensor: 'x', style: 'number', showName: false },
    }];
    const { container } = render(
      <DeckGrid slots={slots} cols={1} rows={1} selectable={false} onCell={() => {}} />,
    );
    const cell = container.querySelector('[data-deck-slot-index="0"]')!;
    expect(cell.querySelector(`.${styles.iconWrap}`)).toBeNull();
    // No live sensor data outside a websocket connection - the tile falls
    // back to its placeholder rather than crashing or showing nothing.
    expect(cell.textContent).toContain('--');
  });

  it('is never treated as an empty/dashed-border cell', () => {
    const slots: DeckSlot[] = [{ action: { type: 'monitoring', category: 'cpu', sensor: '', style: 'line' } }];
    const { container } = render(
      <DeckGrid slots={slots} cols={1} rows={1} selectable onCell={() => {}} selectedIndex={-1} />,
    );
    const cell = container.querySelector('[data-deck-slot-index="0"]')!;
    expect(cell.className).not.toContain(styles.empty);
  });
});
