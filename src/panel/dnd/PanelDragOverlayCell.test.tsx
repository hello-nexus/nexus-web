import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PanelDragOverlayCell } from './PanelDragCells';
import type { PanelWidget } from '../types';

vi.mock('../widgets/registry', () => ({ lookupApp: () => ({}) }));

const widget = { id: 'w1', type: 'clock', size: '2x2', col: 0, row: 0, position: 0 } as unknown as PanelWidget;

function host(flush?: boolean) {
  const { container } = render(
    <PanelDragOverlayCell widget={widget} surface="monitor" themeStyle={{}} themeMode="dark" flush={flush} onSlot={() => {}} />,
  );
  return container.firstElementChild as HTMLElement;
}

describe('PanelDragOverlayCell', () => {
  it('mirrors flush widget padding so the dragged clone is square like the grid cards', () => {
    expect(host(true).getAttribute('data-widget-padding')).toBe('none');
  });

  it('carries no padding attribute otherwise', () => {
    expect(host().hasAttribute('data-widget-padding')).toBe(false);
  });
});
