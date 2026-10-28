// The editor dock and the drag overlay move the live widget; a remount would
// drop whatever the widget holds only in its own state (chat backlog, album art).
import { fireEvent, render } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { StrictMode, useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { PanelWidget } from '../types';
import { showWidgetMoreActions } from '../engine/panelLayoutHelpers';

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
  it('renders the shared EditHint with the edit-widget label under editHint only', () => {
    const { container, rerender } = render(cell({}));
    expect(container.querySelector('[data-edit-hint-overlay]')).toBeNull();
    rerender(cell({ editHint: true }));
    const hint = container.querySelector('[data-edit-hint-overlay]')!;
    expect(hint.getAttribute('aria-hidden')).toBe('true');
    expect(hint.textContent).toBe('panel.widget.editWidget');
  });

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

  describe('More actions corner badge', () => {
    const badge = (c: HTMLElement) => c.querySelector('button[aria-label="lighting.devices.moreActions"]');

    it('renders only when moreActions is passed, and opens the menu at the button', () => {
      const { container, rerender } = render(cell({}));
      expect(badge(container)).toBeNull();
      const onOpen = vi.fn();
      rerender(cell({ moreActions: { open: false, onOpen, onClose: () => {} } }));
      const btn = badge(container)!;
      expect(btn).not.toBeNull();
      fireEvent.click(btn);
      expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it('closes instead of reopening while the menu is open', () => {
      const onOpen = vi.fn();
      const onClose = vi.fn();
      const { container } = render(cell({ moreActions: { open: true, onOpen, onClose } }));
      fireEvent.click(badge(container)!);
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onOpen).not.toHaveBeenCalled();
    });

    it('is absent while the cell is in resize mode', () => {
      const { container } = render(cell({ resizeSelected: true, moreActions: { open: false, onOpen: () => {}, onClose: () => {} } }));
      expect(badge(container)).toBeNull();
    });
  });
});

describe('showWidgetMoreActions', () => {
  const base = { embedded: true, surface: 'desktop', simulator: false, editable: true, busy: false };
  it('is on for the home dashboard only', () => {
    expect(showWidgetMoreActions(base)).toBe(true);
    expect(showWidgetMoreActions({ ...base, embedded: false })).toBe(false);
    expect(showWidgetMoreActions({ ...base, simulator: true })).toBe(false);
    for (const surface of ['y70', 'q60', 'phone', 'monitor']) {
      expect(showWidgetMoreActions({ ...base, surface })).toBe(false);
    }
  });
  it('is off while a sheet, resize or drag is busy', () => {
    expect(showWidgetMoreActions({ ...base, busy: true })).toBe(false);
    expect(showWidgetMoreActions({ ...base, editable: false })).toBe(false);
  });
});
