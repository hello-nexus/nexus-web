// The editor dock and the drag overlay move the live widget; a remount would
// drop whatever the widget holds only in its own state (chat backlog, album art).
import { render } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { StrictMode, useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { PanelWidget } from '../types';

const mounts = vi.fn();
function Probe() {
  useEffect(() => { mounts(); }, []);
  return <div data-testid="probe" />;
}

vi.mock('../widgets/registry', () => ({
  lookupApp: () => ({ Widget: Probe, meta: { i18nKey: 'x' } }),
}));

import { PanelTouchCell } from './PanelDragCells';

const widget: PanelWidget = { id: 'w1', type: 'twitch', size: '2x2', col: 0, row: 0, config: {} } as PanelWidget;
const pointers = { onPointerDown: () => {}, onPointerMove: () => {}, onPointerUp: () => {}, onPointerCancel: () => {} };

function cell(props: Partial<Parameters<typeof PanelTouchCell>[0]>) {
  return (
    <StrictMode>
      <DndContext>
        <SortableContext items={['w1']}>
          <div data-testid="grid">
            <PanelTouchCell widget={widget} rearranging={false} onContextMenu={() => {}} cellPointers={pointers} {...props} />
          </div>
        </SortableContext>
      </DndContext>
    </StrictMode>
  );
}

describe('PanelTouchCell', () => {
  it('keeps the widget mounted through the editor dock', () => {
    const dock = document.body.appendChild(document.createElement('div'));
    const motion = { widgetId: 'w1', phase: 'open' as const, style: {} };
    const { rerender, getByTestId } = render(cell({}));
    mounts.mockClear();

    rerender(cell({ editorDockMotion: motion, editorDockPortal: dock }));
    expect(dock.contains(getByTestId('probe'))).toBe(true);
    rerender(cell({ editorDockMotion: { ...motion, phase: 'closing' }, editorDockPortal: dock }));
    rerender(cell({}));

    expect(getByTestId('grid').contains(getByTestId('probe'))).toBe(true);
    expect(mounts).not.toHaveBeenCalled();
  });

  it('moves the live widget into the drag overlay and back', () => {
    const slot = document.body.appendChild(document.createElement('div'));
    const { rerender, getByTestId } = render(cell({ rearranging: true }));
    mounts.mockClear();

    rerender(cell({ rearranging: true, isDragSource: true, dragOverlaySlot: slot }));
    expect(slot.contains(getByTestId('probe'))).toBe(true);
    rerender(cell({ rearranging: false, dragOverlaySlot: slot }));

    expect(getByTestId('grid').contains(getByTestId('probe'))).toBe(true);
    expect(mounts).not.toHaveBeenCalled();
  });

  it('takes the widget back when the overlay left the document first', () => {
    const slot = document.body.appendChild(document.createElement('div'));
    const { rerender, getByTestId } = render(cell({ rearranging: true }));
    mounts.mockClear();

    rerender(cell({ rearranging: true, isDragSource: true, dragOverlaySlot: slot }));
    slot.remove();
    rerender(cell({ rearranging: false }));

    expect(getByTestId('grid').contains(getByTestId('probe'))).toBe(true);
    expect(mounts).not.toHaveBeenCalled();
  });

  it('renders in place on a surface without touch input', () => {
    const { getByTestId } = render(cell({ surface: 'q60' }));
    const wrap = getByTestId('grid').firstElementChild as HTMLElement;

    expect(wrap.dataset.panelWidgetId).toBe('w1');
    expect(wrap.firstElementChild?.classList.contains('panel-card')).toBe(true);
  });

  it('leaves nothing in the overlay when it unmounts mid-drag', () => {
    const slot = document.body.appendChild(document.createElement('div'));
    const { rerender, unmount } = render(cell({ rearranging: true }));

    rerender(cell({ rearranging: true, isDragSource: true, dragOverlaySlot: slot }));
    unmount();

    expect(slot.childNodes).toHaveLength(0);
  });
});
