import { render, screen, fireEvent } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { describe, it, expect, vi } from 'vitest';
import { DeckDevicePreview, type DeckDevicePreviewProps } from './DeckDevicePreview';
import type { DeckDial } from './types';

vi.mock('../common/AppPicker', () => ({ useAppIcon: () => null }));

const GRID = { slots: [], cols: 4, rows: 2, selectable: true, onCell: () => {}, square: true, page: 0, folderPath: [] as number[] };

function renderPreview(over: Partial<DeckDevicePreviewProps> & Pick<DeckDevicePreviewProps, 'deck'>) {
  const props: DeckDevicePreviewProps = { grid: GRID, dials: [], selectedDial: null, onSelectDial: vi.fn(), ...over };
  const utils = render(<DndContext><DeckDevicePreview {...props} /></DndContext>);
  return { ...utils, props };
}

const count = (c: HTMLElement, attr: string) => c.querySelectorAll(`[${attr}]`).length;

describe('DeckDevicePreview', () => {
  it('a button-only deck renders just the keys', () => {
    const { container } = renderPreview({ deck: {} });
    expect(count(container, 'data-deck-dial-index')).toBe(0);
    expect(count(container, 'data-deck-knob-index')).toBe(0);
  });

  it('Plus XL: six segments and six knobs', () => {
    const { container } = renderPreview({
      deck: { encoders: 6, dialPlacement: 'below', screen: { width: 1200, height: 100, kind: 'touchStrip' } },
      dials: Array.from({ length: 6 }, () => ({})),
    });
    expect(count(container, 'data-deck-dial-index')).toBe(6);
    expect(count(container, 'data-deck-knob-index')).toBe(6);
  });

  it('segments take the strip aspect, split evenly across the dials', () => {
    const { container } = renderPreview({
      deck: { encoders: 4, dialPlacement: 'below', screen: { width: 800, height: 100, kind: 'touchStrip' } },
      dials: [{}, {}, {}, {}],
    });
    expect((container.querySelector('[data-deck-dial-index="0"]') as HTMLElement).style.getPropertyValue('--dial-aspect')).toBe('2');
  });

  it('Galleon: two segments of its screen with a knob each side, above the keys', () => {
    const { container } = renderPreview({
      deck: { encoders: 2, dialPlacement: 'above', screen: { width: 720, height: 384, kind: 'dialScreen' } },
      dials: [{}, {}],
    });
    expect(count(container, 'data-deck-dial-index')).toBe(2);
    expect(count(container, 'data-deck-knob-index')).toBe(2);
    const knob = container.querySelector('[data-deck-knob-index="0"]')!;
    const keys = container.querySelector('[data-deck-slot-index], [class*="grid"]')!;
    expect(knob.compareDocumentPosition(keys) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Studio: knobs flank the keys, with the non-square key height', () => {
    const { container } = renderPreview({
      deck: { encoders: 2, dialPlacement: 'sides', screen: null, keyWidth: 144, keyHeight: 112, encoderRingLeds: 24 },
      dials: [{}, {}],
      grid: { ...GRID, cols: 16, rows: 2 },
    });
    expect(count(container, 'data-deck-dial-index')).toBe(0);
    expect(count(container, 'data-deck-knob-index')).toBe(2);
    const grid = container.querySelector('[style*="grid-template-rows"]') as HTMLElement;
    expect(grid.style.gridTemplateRows).toContain('0.77');
  });

  it('Neo: shows the info screen frame when one arrived, and a clock stand-in before', () => {
    const deck = { encoders: 0, touchKeys: 2, screen: { width: 248, height: 58, kind: 'infoScreen' as const } };
    const before = renderPreview({ deck });
    expect(before.container.querySelector('img')).toBeNull();
    before.unmount();
    const after = renderPreview({ deck, grid: { ...GRID, liveTiles: new Map([['0:info', 'data:image/jpeg;base64,QQ==']]) } });
    expect(after.container.querySelector('img')).toHaveAttribute('src', 'data:image/jpeg;base64,QQ==');
  });

  it('selecting a segment or a knob reports the dial index and marks it pressed', () => {
    const dials: DeckDial[] = [{}, {}, {}, {}];
    const { container, props, rerender } = renderPreview({
      deck: { encoders: 4, dialPlacement: 'below', screen: { width: 800, height: 100, kind: 'touchStrip' } },
      dials,
    });
    fireEvent.click(container.querySelector('[data-deck-dial-index="1"]')!);
    expect(props.onSelectDial).toHaveBeenCalledWith(1);
    fireEvent.click(container.querySelector('[data-deck-knob-index="3"]')!);
    expect(props.onSelectDial).toHaveBeenCalledWith(3);
    rerender(<DndContext><DeckDevicePreview {...props} selectedDial={3} /></DndContext>);
    expect(container.querySelector('[data-deck-dial-index="3"]')).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('[data-deck-dial-index="1"]')).toHaveAttribute('aria-pressed', 'false');
  });

  it('a bound segment shows its title and, with a stack, one position dot per entry', () => {
    renderPreview({
      deck: { encoders: 2, dialPlacement: 'below', screen: { width: 400, height: 100, kind: 'touchStrip' } },
      dials: [{ stack: [{ label: 'First', action: { type: 'volume' } }, { label: 'Second' }] }, { action: { type: 'page' } }],
    });
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.queryByText('Second')).toBeNull();
    expect(screen.getByText('panel.settings.deck.dial.action.page')).toBeInTheDocument();
  });

  it('a segment shows only the live tile of the current folder view', () => {
    const tiles = new Map([['0:dial:0', 'data:a'], ['0:1.dial:0', 'data:b']]);
    const deck = { encoders: 1, dialPlacement: 'below' as const, screen: { width: 200, height: 100, kind: 'touchStrip' as const } };
    const dials = [{ action: { type: 'volume' as const } }];
    const inFolder = renderPreview({ deck, dials, grid: { ...GRID, liveTiles: tiles, folderPath: [1] } });
    expect(inFolder.container.querySelector('[data-deck-dial-index="0"] img')).toHaveAttribute('src', 'data:b');
    inFolder.unmount();
    const otherFolder = renderPreview({ deck, dials, grid: { ...GRID, liveTiles: tiles, folderPath: [2] } });
    expect(otherFolder.container.querySelector('[data-deck-dial-index="0"] img')).toBeNull();
  });
});
