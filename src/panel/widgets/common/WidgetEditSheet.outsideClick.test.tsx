// The Select menu is portaled onto document.body; its search field sits beside
// the listbox, so the sheet's outside-click guard must treat the whole menu as inside.
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Select } from '../../../components/common/Select/Select';
import { WidgetEditSheet } from './WidgetEditSheet';

const OPTIONS = Array.from({ length: 10 }, (_, i) => ({ value: `s${i}`, label: `Sensor ${i}` }));

vi.mock('../registry', () => ({
  lookupApp: () => ({
    meta: {},
    Settings: () => <Select value="s0" onChange={() => {}} options={OPTIONS} ariaLabel="sensor" />,
  }),
  sizesForSurface: () => [],
}));

describe('WidgetEditSheet outside click', () => {
  beforeEach(() => {
    // The in-menu search field is offered only on a hover + fine-pointer device.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(hover: hover) and (pointer: fine)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  function renderSheet(onClose: () => void) {
    render(
      <WidgetEditSheet
        widget={{ id: 'w1', type: 'stub', size: '2x2', col: 0, row: 0 }}
        surface="desktop"
        onResize={vi.fn()}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'sensor' }));
  }

  it('stays open when the portaled Select search field is clicked', () => {
    const onClose = vi.fn();
    renderSheet(onClose);
    fireEvent.pointerDown(screen.getByRole('combobox'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on a click outside the sheet and its menu', () => {
    const onClose = vi.fn();
    renderSheet(onClose);
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
