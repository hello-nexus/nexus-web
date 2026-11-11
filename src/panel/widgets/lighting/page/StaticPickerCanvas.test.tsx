import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hsvToHex } from '../../../../lib/settings';
import { StaticPickerCanvas } from './StaticPickerCanvas';
import {
  PICKER_ACTIVE_MS, PICKER_SEGMENT_COLS, PICKER_SEGMENT_ROWS, SEGMENT_SWATCHES, pickerHexAt,
} from './staticPickerField';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const W = 1200;
const H = 700;

function renderWith(devices: { id: string; name: string; hex: string }[]) {
  return render(
    <StaticPickerCanvas
      devices={devices} hex="" segmented patternEffect={null} patternSlot={0}
      patternVersion="" gpuAvailable={false} onPreview={vi.fn()} onCommit={vi.fn()}
    />,
  );
}

function setup(segmented = true, devices: { id: string; name: string; hex: string }[] = []) {
  const onPreview = vi.fn();
  const onCommit = vi.fn();
  const { container } = render(
    <StaticPickerCanvas
      devices={devices} hex="" segmented={segmented} patternEffect={null} patternSlot={0}
      patternVersion="" gpuAvailable={false} onPreview={onPreview} onCommit={onCommit}
    />,
  );
  const field = container.querySelector('[data-pick]') as HTMLDivElement;
  field.getBoundingClientRect = () => ({
    left: 0, top: 0, right: W, bottom: H, width: W, height: H, x: 0, y: 0, toJSON: () => ({}),
  });
  field.setPointerCapture = vi.fn();
  return { field, onPreview, onCommit };
}

// jsdom has no layout, so the field's measured size is stubbed.
function stubFieldSize() {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(W);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(H);
}

const cellPoint = (col: number, row: number) => ({
  clientX: ((col + 0.5) / PICKER_SEGMENT_COLS) * W,
  clientY: ((row + 0.5) / PICKER_SEGMENT_ROWS) * H,
});
const swatch = (col: number, row: number) => SEGMENT_SWATCHES[row * PICKER_SEGMENT_COLS + col];

describe('StaticPickerCanvas under a legacy zoom engine', () => {
  afterEach(() => vi.restoreAllMocks());

  // Older WebView2 reports the rect in unzoomed px while the pointer stays in
  // viewport px; the panel's immersive body zooms the field by --panel-scale.
  it('picks the color under the fingertip when the rect is unzoomed', () => {
    const zoom = 1.83;
    const { field, onPreview } = setup(false);
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      el => ({ zoom: el === field ? String(zoom) : '1' }) as CSSStyleDeclaration,
    );
    Object.defineProperty(field, 'offsetWidth', { configurable: true, value: W });
    field.getBoundingClientRect = () => ({
      left: 100, top: 200, right: 100 + W, bottom: 200 + H, width: W, height: H, x: 100, y: 200, toJSON: () => ({}),
    });
    fireEvent.pointerDown(field, {
      pointerId: 1, clientX: (100 + 0.5 * W) * zoom, clientY: (200 + 0.5 * H) * zoom,
    });
    expect(onPreview).toHaveBeenLastCalledWith(pickerHexAt(0.5, 0.5));
  });
});

describe('StaticPickerCanvas touch', () => {
  let now: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    now = vi.spyOn(performance, 'now').mockReturnValue(0);
  });
  afterEach(() => now.mockRestore());

  it('picks the drawn row under a tap, in every row', () => {
    for (let row = 0; row < PICKER_SEGMENT_ROWS; row++) {
      const { field, onPreview } = setup();
      fireEvent.pointerDown(field, { pointerId: 1, ...cellPoint(3, row) });
      expect(onPreview).toHaveBeenLastCalledWith(swatch(3, row));
    }
  });

  it('picks the drawn row in the band the lightness stops used to hand to the neighbor', () => {
    const { field, onPreview } = setup();
    fireEvent.pointerDown(field, { pointerId: 1, clientX: 0.5 * W, clientY: (1.2 / PICKER_SEGMENT_ROWS) * H });
    expect(onPreview).toHaveBeenLastCalledWith(swatch(6, 1));
  });

  it('follows moves from the owning pointer and commits on its release', () => {
    const { field, onPreview, onCommit } = setup();
    fireEvent.pointerDown(field, { pointerId: 1, ...cellPoint(2, 2) });
    fireEvent.pointerMove(field, { pointerId: 1, ...cellPoint(5, 4) });
    expect(onPreview).toHaveBeenLastCalledWith(swatch(5, 4));
    fireEvent.pointerUp(field, { pointerId: 1, ...cellPoint(5, 4) });
    expect(onCommit).toHaveBeenCalledWith(swatch(5, 4));
  });

  it('ignores a second pointer while one owns the pick', () => {
    const { field, onPreview, onCommit } = setup();
    fireEvent.pointerDown(field, { pointerId: 1, ...cellPoint(2, 2) });
    onPreview.mockClear();
    fireEvent.pointerDown(field, { pointerId: 2, ...cellPoint(11, 6) });
    fireEvent.pointerMove(field, { pointerId: 2, clientX: W + 200, clientY: H + 200 });
    fireEvent.pointerUp(field, { pointerId: 2 });
    expect(onPreview).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.pointerMove(field, { pointerId: 1, ...cellPoint(3, 2) });
    expect(onPreview).toHaveBeenLastCalledWith(swatch(3, 2));
    fireEvent.pointerUp(field, { pointerId: 1 });
    expect(onCommit).toHaveBeenCalledWith(swatch(3, 2));
  });

  it('accepts a new pick after the owner is released', () => {
    const { field, onPreview } = setup();
    fireEvent.pointerDown(field, { pointerId: 1, ...cellPoint(2, 2) });
    fireEvent.pointerUp(field, { pointerId: 1 });
    fireEvent.pointerDown(field, { pointerId: 2, ...cellPoint(4, 5) });
    expect(onPreview).toHaveBeenLastCalledWith(swatch(4, 5));
  });

  it('recovers when the owner never released: the same pointer or a later contact takes over', () => {
    const { field, onPreview } = setup();
    fireEvent.pointerDown(field, { pointerId: 1, ...cellPoint(2, 2) });
    fireEvent.pointerDown(field, { pointerId: 1, ...cellPoint(4, 3) });
    expect(onPreview).toHaveBeenLastCalledWith(swatch(4, 3));
    now.mockReturnValue(PICKER_ACTIVE_MS + 1);
    fireEvent.pointerDown(field, { pointerId: 7, ...cellPoint(6, 1) });
    expect(onPreview).toHaveBeenLastCalledWith(swatch(6, 1));
  });

  it('lets a fingertip take the pick from a palm that landed first', () => {
    const { field, onPreview, onCommit } = setup();
    fireEvent.pointerDown(field, { pointerId: 1, ...cellPoint(11, 6) });
    now.mockReturnValue(PICKER_ACTIVE_MS + 1);
    fireEvent.pointerDown(field, { pointerId: 2, ...cellPoint(3, 2) });
    expect(onPreview).toHaveBeenLastCalledWith(swatch(3, 2));
    fireEvent.pointerMove(field, { pointerId: 1, ...cellPoint(10, 6) });
    fireEvent.pointerUp(field, { pointerId: 1 });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.pointerUp(field, { pointerId: 2 });
    expect(onCommit).toHaveBeenCalledWith(swatch(3, 2));
  });

  it('keeps a fresh tap when a palm grazes right behind the fingertip', () => {
    const { field, onPreview, onCommit } = setup();
    fireEvent.pointerDown(field, { pointerId: 1, ...cellPoint(3, 2) });
    now.mockReturnValue(PICKER_ACTIVE_MS - 10);
    fireEvent.pointerDown(field, { pointerId: 2, ...cellPoint(11, 6) });
    fireEvent.pointerUp(field, { pointerId: 1 });
    expect(onPreview).not.toHaveBeenCalledWith(swatch(11, 6));
    expect(onCommit).toHaveBeenCalledWith(swatch(3, 2));
  });

  it('keeps a drag in progress when a palm lands mid-stroke', () => {
    const { field, onPreview, onCommit } = setup();
    fireEvent.pointerDown(field, { pointerId: 1, ...cellPoint(2, 2) });
    now.mockReturnValue(PICKER_ACTIVE_MS * 2);
    fireEvent.pointerMove(field, { pointerId: 1, ...cellPoint(3, 2) });
    now.mockReturnValue(PICKER_ACTIVE_MS * 3 - 10);
    fireEvent.pointerDown(field, { pointerId: 2, ...cellPoint(11, 6) });
    fireEvent.pointerUp(field, { pointerId: 1 });
    expect(onPreview).not.toHaveBeenCalledWith(swatch(11, 6));
    expect(onCommit).toHaveBeenCalledWith(swatch(3, 2));
  });
});

describe('StaticPickerCanvas segmented marker', () => {
  beforeEach(() => stubFieldSize());
  afterEach(() => vi.restoreAllMocks());

  const outline = (container: HTMLElement) =>
    container.querySelector('[class*="staticCell"]') as HTMLElement;
  const pin = (el: HTMLElement) => el.parentElement as HTMLElement;

  it('centers the cell outline on the swatch of a device sitting on one', () => {
    const { container } = renderWith([{ id: 'a', name: 'A', hex: swatch(0, 3) }]);
    const cell = outline(container);
    expect(pin(cell).style.left).toBe(`${0.5 * (W / PICKER_SEGMENT_COLS)}px`);
    expect(pin(cell).style.top).toBe(`${3.5 * (H / PICKER_SEGMENT_ROWS)}px`);
    expect(cell.className).not.toContain('staticCellInexact');
  });

  it('marks pure red exactly on its own cell', () => {
    const { container } = renderWith([{ id: 'a', name: 'A', hex: '#ff0000' }]);
    const cell = outline(container);
    expect(pin(cell).style.left).toBe(`${0.5 * (W / PICKER_SEGMENT_COLS)}px`);
    expect(cell.className).not.toContain('staticCellInexact');
  });

  it('puts a hue just short of a full turn on the first column', () => {
    const { container } = renderWith([{ id: 'a', name: 'A', hex: hsvToHex(350, 100, 100) }]);
    const cell = outline(container);
    expect(pin(cell).style.left).toBe(`${0.5 * (W / PICKER_SEGMENT_COLS)}px`);
    expect(cell.className).toContain('staticCellInexact');
  });
});
