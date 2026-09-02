import { render, fireEvent, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DeckGrid } from './DeckGrid';
import type { DeckSlot } from './types';
import styles from './DeckGrid.module.scss';

vi.mock('../common/AppPicker', () => ({ useAppIcon: () => null }));
vi.mock('./useDeckImage', () => ({ useDeckImage: (id?: string) => (id ? 'blob:mock-image' : null) }));
vi.mock('./useSiteIcon', () => ({ useSiteIcon: (url?: string) => (url === 'https://has-icon.example' ? 'blob:mock-site-icon' : null) }));

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

  it('renders the Back cell with the curved go-up-a-level glyph, matching the physical back-key bitmap', () => {
    const { container } = render(
      <DeckGrid
        slots={[{ label: 'a' }]}
        cols={2}
        rows={1}
        selectable={false}
        onCell={() => {}}
        backCell={{ onBack: () => {}, ariaLabel: 'Back' }}
      />,
    );
    const backButton = container.querySelector('button[aria-label="Back"]')!;
    expect(backButton.querySelector('svg.lucide-undo-2')).not.toBeNull();
    expect(backButton.querySelector('svg.lucide-chevron-left')).toBeNull();
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

describe('DeckGrid live tile frames (physical editor preview)', () => {
  const monitoringSlots: DeckSlot[] = [{
    action: { type: 'monitoring', category: 'cpu', sensor: 'x', style: 'number', showName: false },
  }];
  const weatherSlots: DeckSlot[] = [{ action: { type: 'weather' } }];
  const liveSrc = 'data:image/jpeg;base64,abc123';

  it('renders the service-pushed frame as an img for a monitoring slot with a matching key', () => {
    const liveTiles = new Map([['0:0', liveSrc]]);
    const { container } = render(
      <DeckGrid slots={monitoringSlots} cols={1} rows={1} selectable={false} onCell={() => {}} liveTiles={liveTiles} page={0} folderPath={[]} />,
    );
    const cell = container.querySelector('[data-deck-slot-index="0"]')!;
    const img = cell.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe(liveSrc);
    expect(img?.getAttribute('draggable')).toBe('false');
  });

  it('renders the service-pushed frame as an img for a weather slot with a matching key', () => {
    const liveTiles = new Map([['0:0', liveSrc]]);
    const { container } = render(
      <DeckGrid slots={weatherSlots} cols={1} rows={1} selectable={false} onCell={() => {}} liveTiles={liveTiles} page={0} folderPath={[]} />,
    );
    const cell = container.querySelector('[data-deck-slot-index="0"]')!;
    const img = cell.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe(liveSrc);
  });

  it('falls back to the CSS tile when liveTiles is absent (touch widget path, unchanged)', () => {
    const { container } = render(
      <DeckGrid slots={monitoringSlots} cols={1} rows={1} selectable={false} onCell={() => {}} />,
    );
    const cell = container.querySelector('[data-deck-slot-index="0"]')!;
    expect(cell.querySelector('img')).toBeNull();
    expect(cell.textContent).toContain('--');
  });

  it('falls back to the CSS tile when no frame matches this cell key yet', () => {
    const liveTiles = new Map([['0:5', liveSrc]]);
    const { container } = render(
      <DeckGrid slots={monitoringSlots} cols={1} rows={1} selectable={false} onCell={() => {}} liveTiles={liveTiles} page={0} folderPath={[]} />,
    );
    const cell = container.querySelector('[data-deck-slot-index="0"]')!;
    expect(cell.querySelector('img')).toBeNull();
    expect(cell.textContent).toContain('--');
  });

  it('keys the frame lookup on folderPath + index, matching the page-relative slotPathAt grammar (no page prefix)', () => {
    const liveTiles = new Map([['0:2.0', liveSrc]]);
    const { container } = render(
      <DeckGrid slots={monitoringSlots} cols={1} rows={1} selectable={false} onCell={() => {}} liveTiles={liveTiles} page={0} folderPath={[2]} />,
    );
    const cell = container.querySelector('[data-deck-slot-index="0"]')!;
    expect(cell.querySelector('img')?.getAttribute('src')).toBe(liveSrc);
  });

  it('names the live-frame img from the slot label, for screen readers', () => {
    const labeledSlots: DeckSlot[] = [{
      label: 'CPU Load',
      action: { type: 'monitoring', category: 'cpu', sensor: 'x', style: 'number', showName: false, labelText: 'ignored when slot.label is set' },
    }];
    const liveTiles = new Map([['0:0', liveSrc]]);
    const { container } = render(
      <DeckGrid slots={labeledSlots} cols={1} rows={1} selectable={false} onCell={() => {}} liveTiles={liveTiles} page={0} folderPath={[]} />,
    );
    const cell = container.querySelector('[data-deck-slot-index="0"]')!;
    expect(cell.querySelector('img')?.getAttribute('alt')).toBe('CPU Load');
  });

  it('falls back to the monitoring action\'s labelText when the slot has no label', () => {
    const liveTiles = new Map([['0:0', liveSrc]]);
    const { container } = render(
      <DeckGrid
        slots={[{ action: { type: 'monitoring', category: 'cpu', sensor: 'x', style: 'number', showName: false, labelText: 'Processor' } }]}
        cols={1} rows={1} selectable={false} onCell={() => {}} liveTiles={liveTiles} page={0} folderPath={[]}
      />,
    );
    const cell = container.querySelector('[data-deck-slot-index="0"]')!;
    expect(cell.querySelector('img')?.getAttribute('alt')).toBe('Processor');
  });

  it('names the live-frame img from the weather action\'s city when the slot has no label', () => {
    const liveTiles = new Map([['0:0', liveSrc]]);
    const { container } = render(
      <DeckGrid
        slots={[{ action: { type: 'weather', city: 'San Francisco' } }]}
        cols={1} rows={1} selectable={false} onCell={() => {}} liveTiles={liveTiles} page={0} folderPath={[]}
      />,
    );
    const cell = container.querySelector('[data-deck-slot-index="0"]')!;
    expect(cell.querySelector('img')?.getAttribute('alt')).toBe('San Francisco');
  });
});

describe('DeckGrid selection ring - zero layout shift', () => {
  it('toggling selection changes only the class list, never an inline style (size/gap/scroll extent stay identical)', () => {
    const slots: DeckSlot[] = [{ label: 'a' }, { label: 'b' }];
    const { container, rerender } = render(
      <DeckGrid slots={slots} cols={2} rows={1} selectable selectedIndex={-1} onCell={() => {}} />,
    );
    const cell = container.querySelector('[data-deck-slot-index="0"]')!;
    // The ring is an outset box-shadow custom property on the cell's own
    // class (see DeckGrid.module.scss .selected) - never a border/padding/
    // margin swap and never a wrapper element, so selecting/deselecting can
    // only change className, not the box model or DOM shape.
    const styleBefore = cell.getAttribute('style');
    const childCountBefore = container.querySelectorAll('[data-deck-slot-index]').length;

    rerender(<DeckGrid slots={slots} cols={2} rows={1} selectable selectedIndex={0} onCell={() => {}} />);

    const selectedCell = container.querySelector('[data-deck-slot-index="0"]')!;
    expect(selectedCell.className).toContain(styles.selected);
    expect(selectedCell.getAttribute('style')).toBe(styleBefore);
    expect(container.querySelectorAll('[data-deck-slot-index]').length).toBe(childCountBefore);
  });
});

describe('DeckGrid custom image icon', () => {
  it('renders an img with the blob URL for a slot whose icon kind is image', () => {
    const slots: DeckSlot[] = [{ icon: { kind: 'image', value: 'abc123' } }];
    const { container } = render(
      <DeckGrid slots={slots} cols={1} rows={1} selectable={false} onCell={() => {}} />,
    );
    const cell = container.querySelector('[data-deck-slot-index="0"]')!;
    const img = cell.querySelector(`img.${styles.customImage}`);
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('blob:mock-image');
  });

  it('counts an image-icon slot as non-empty even with no action bound', () => {
    const slots: DeckSlot[] = [{ icon: { kind: 'image', value: 'abc123' } }];
    const { container } = render(
      <DeckGrid slots={slots} cols={1} rows={1} selectable selectedIndex={-1} onCell={() => {}} />,
    );
    const cell = container.querySelector('[data-deck-slot-index="0"]')!;
    expect(cell.className).not.toContain(styles.empty);
  });
});

describe('DeckGrid right-click delete', () => {
  it('right-clicking a populated cell opens a menu with a Delete entry and reports the index on selection', () => {
    const slots: DeckSlot[] = [
      { action: { type: 'hotkey', keys: '' } },
      { action: { type: 'hotkey', keys: '' } },
    ];
    const onDeleteSlot = vi.fn();
    const { container } = render(
      <DeckGrid slots={slots} cols={2} rows={1} selectable selectedIndex={-1} onCell={() => {}} onDeleteSlot={onDeleteSlot} />,
    );

    const notPrevented = fireEvent.contextMenu(container.querySelector('[data-deck-slot-index="1"]')!);
    // dispatchEvent returns false once preventDefault() was called during
    // dispatch - the browser's own context menu must never appear here.
    expect(notPrevented).toBe(false);

    fireEvent.click(screen.getByText('common.delete'));
    expect(onDeleteSlot).toHaveBeenCalledWith(1);
  });

  it('right-clicking an empty cell does not open the menu (nothing to delete)', () => {
    const slots: DeckSlot[] = [{}];
    const onDeleteSlot = vi.fn();
    const { container } = render(
      <DeckGrid slots={slots} cols={1} rows={1} selectable selectedIndex={-1} onCell={() => {}} onDeleteSlot={onDeleteSlot} />,
    );

    const notPrevented = fireEvent.contextMenu(container.querySelector('[data-deck-slot-index="0"]')!);
    expect(notPrevented).toBe(true);
    expect(screen.queryByText('common.delete')).toBeNull();
  });

  it('omitting onDeleteSlot never renders a context menu (backward compatible with every other DeckGrid caller)', () => {
    const slots: DeckSlot[] = [{ action: { type: 'hotkey', keys: '' } }];
    const { container } = render(
      <DeckGrid slots={slots} cols={1} rows={1} selectable selectedIndex={-1} onCell={() => {}} />,
    );

    fireEvent.contextMenu(container.querySelector('[data-deck-slot-index="0"]')!);
    expect(screen.queryByText('common.delete')).toBeNull();
  });
});

describe('DeckGrid transparent background', () => {
  const slots: DeckSlot[] = [{ action: { type: 'hotkey', keys: '' }, color: 'transparent' }];

  it('paints --deck-accent as transparent on the touch-widget grid', () => {
    const { container } = render(
      <DeckGrid slots={slots} cols={1} rows={1} selectable={false} onCell={() => {}} />,
    );
    const cell = container.querySelector('[data-deck-slot-index="0"]') as HTMLElement;
    expect(cell.style.getPropertyValue('--deck-accent')).toBe('transparent');
  });

  it('previews transparent as the hardware off-black in square (physical mirror) mode', () => {
    const { container } = render(
      <DeckGrid slots={slots} cols={1} rows={1} selectable square onCell={() => {}} />,
    );
    const cell = container.querySelector('[data-deck-slot-index="0"]') as HTMLElement;
    expect(cell.style.getPropertyValue('--deck-accent')).toBe('#000000');
  });
});

describe('DeckGrid icon sources', () => {
  const renderSlot = (slot: DeckSlot) =>
    render(<DeckGrid slots={[slot]} cols={1} rows={1} selectable={false} onCell={() => {}} />).container;

  it('shows the site icon on a url key instead of the stock globe', () => {
    const container = renderSlot({ action: { type: 'openUrl', url: 'https://has-icon.example' } });
    expect(container.querySelector('img[src="blob:mock-site-icon"]')).not.toBeNull();
    expect(container.querySelector('svg.lucide-globe')).toBeNull();
  });

  it('falls back to the globe when the site has no icon', () => {
    const container = renderSlot({ action: { type: 'openUrl', url: 'https://no-icon.example' } });
    expect(container.querySelector('img[src="blob:mock-site-icon"]')).toBeNull();
    expect(container.querySelector('svg.lucide-globe')).not.toBeNull();
  });

  it('keeps an explicitly picked icon over the site icon', () => {
    const container = renderSlot({
      action: { type: 'openUrl', url: 'https://has-icon.example' },
      icon: { kind: 'lucide', value: 'Star' },
    });
    expect(container.querySelector('img[src="blob:mock-site-icon"]')).toBeNull();
    expect(container.querySelector('svg.lucide-star')).not.toBeNull();
  });

  it('keeps the app placeholder on an icon-only app slot with no action', () => {
    const container = renderSlot({ icon: { kind: 'app', value: 'Discord' } });
    expect(container.querySelector('svg.lucide-app-window')).not.toBeNull();
    expect(container.querySelector('svg.lucide-plus')).toBeNull();
  });

  it('falls back to the action icon, not AppWindow, when an exe key has no extractable icon', () => {
    const container = renderSlot({ action: { type: 'openFile', path: 'C:\\Games\\Hades\\Hades.exe' } });
    expect(container.querySelector('svg.lucide-file-text')).not.toBeNull();
    expect(container.querySelector('svg.lucide-app-window')).toBeNull();
  });
});
