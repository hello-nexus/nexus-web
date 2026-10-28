import { render } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { describe, expect, it, vi } from 'vitest';
import type { PanelWidget } from '../types';

const onPreset = vi.fn();
function CoolingProbe() {
  return <button type="button" data-testid="preset" onClick={onPreset}>preset</button>;
}

vi.mock('../widgets/registry', () => ({
  lookupApp: () => ({ Widget: CoolingProbe, meta: { i18nKey: 'x' } }),
}));

import { PanelTouchCell } from './PanelDragCells';

const widget: PanelWidget = { id: 'w1', type: 'cooling', size: '2x2', col: 0, row: 0, config: {} } as PanelWidget;
const pointers = { onPointerDown: () => {}, onPointerMove: () => {}, onPointerUp: () => {}, onPointerCancel: () => {} };

function cell(inert: boolean) {
  return (
    <DndContext>
      <SortableContext items={['w1']}>
        <PanelTouchCell widget={widget} rearranging={false} inert={inert} onContextMenu={() => {}} cellPointers={pointers} />
      </SortableContext>
    </DndContext>
  );
}

describe('PanelTouchCell inert (Windows OOBE)', () => {
  it('takes no pointer input inside the widget, so cooling presets cannot be pressed', () => {
    const { getByTestId } = render(cell(true));
    const scaler = getByTestId('preset').closest('[style]') as HTMLElement;
    expect(scaler.style.pointerEvents).toBe('none');
  });

  it('leaves the widget interactive otherwise', () => {
    const { getByTestId } = render(cell(false));
    expect(getByTestId('preset').closest('[style*="pointer-events"]')).toBeNull();
  });
});
