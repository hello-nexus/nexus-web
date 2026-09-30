import { act, render } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { DndContext } from '@dnd-kit/core';
import { GroupedSortableList } from './GroupedSortableList';
import type { Arrangement } from './groupedDrag';

// jsdom has no layout for dnd-kit's collision detection, so the test drives the
// list's own drag handlers through the context it renders.
const dnd = vi.hoisted(() => ({ props: null as ComponentProps<typeof DndContext> | null }));
vi.mock('@dnd-kit/core', async importOriginal => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...actual,
    DndContext: (props: ComponentProps<typeof actual.DndContext>) => {
      dnd.props = props;
      return <actual.DndContext {...props} />;
    },
  };
});

const arrangement: Arrangement = { rowIds: ['open', 'shut', 'card'], groupMembers: { open: [], shut: [] } };

function renderList(onArrange = vi.fn()) {
  render(
    <GroupedSortableList
      arrangement={arrangement}
      onArrange={onArrange}
      renderBlock={(id, a) => <div ref={a.ref} data-row={id}>{id}</div>}
      renderGroup={(id, a, children, isDropTarget) => (
        <div ref={a.ref} data-row={id} data-target={isDropTarget}>
          {id}
          {id === 'open' && children}
        </div>
      )}
    />,
  );
  return onArrange;
}

const drag = (over: string) => ({ active: { id: 'card' }, over: { id: over } }) as never;

describe('GroupedSortableList', () => {
  it('moves a row into an open group mid-drag', () => {
    renderList();
    act(() => dnd.props!.onDragStart!({ active: { id: 'card' } } as never));
    act(() => dnd.props!.onDragOver!(drag('open')));
    expect(document.querySelector('[data-row=open] [data-row=card]')).not.toBeNull();
  });

  it('keeps a row out of a collapsed group mid-drag and drops it inside', () => {
    const onArrange = renderList();
    act(() => dnd.props!.onDragStart!({ active: { id: 'card' } } as never));
    act(() => dnd.props!.onDragOver!(drag('shut')));
    // Moved inside, the row would unmount with the collapsed body and shrink the list.
    expect(document.querySelector('[role=list] > [data-row=card]')).not.toBeNull();
    expect(document.querySelector('[data-row=shut]')?.getAttribute('data-target')).toBe('true');
    act(() => dnd.props!.onDragOver!({ active: { id: 'card' }, over: null } as never));
    expect(document.querySelector('[data-row=shut]')?.getAttribute('data-target')).toBe('false');
    act(() => dnd.props!.onDragEnd!(drag('shut')));
    expect(onArrange).toHaveBeenCalledWith({ rowIds: ['open', 'shut'], groupMembers: { open: [], shut: ['card'] } });
  });
});
