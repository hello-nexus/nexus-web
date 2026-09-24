import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CollapsibleSection } from './CollapsibleSection';
import type { EditableTextHandle } from '../Editable/EditableText';
import styles from './CollapsibleSection.module.scss';

function renderRenameable() {
  const onToggle = vi.fn();
  const onTitleRename = vi.fn();
  const ref = createRef<EditableTextHandle>();
  render(
    <CollapsibleSection title="Desk" ariaLabel="Desk" open onToggle={onToggle} onTitleRename={onTitleRename} titleRenameRef={ref}>
      <div>body</div>
    </CollapsibleSection>,
  );
  return { onToggle, onTitleRename, ref };
}

describe('CollapsibleSection title renamed from a menu', () => {
  it('is a pointer target that toggles the section, with no editor on click', () => {
    const { onToggle } = renderRenameable();
    const title = screen.getByText('Desk');
    expect(title.className).toContain(styles.titleSlot);
    fireEvent.click(title);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.queryByDisplayValue('Desk')).toBeNull();
  });

  it('opens the editor only through the handle, commits the trimmed name on Enter, and puts the title back', () => {
    const { onToggle, onTitleRename, ref } = renderRenameable();
    act(() => ref.current!.startEditing());
    const input = screen.getByDisplayValue('Desk');
    fireEvent.change(input, { target: { value: '  Shelf  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onTitleRename).toHaveBeenCalledWith('Shelf');
    expect(screen.queryByDisplayValue('Desk')).toBeNull();
    fireEvent.click(screen.getByText('Desk'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('drops the edit on Escape without committing', () => {
    const { onTitleRename, ref } = renderRenameable();
    act(() => ref.current!.startEditing());
    const input = screen.getByDisplayValue('Desk');
    fireEvent.change(input, { target: { value: 'Shelf' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onTitleRename).not.toHaveBeenCalled();
    expect(screen.getByText('Desk').className).toContain(styles.titleSlot);
  });

  it('keeps a click inside the editor from toggling the section', () => {
    const { onToggle, ref } = renderRenameable();
    act(() => ref.current!.startEditing());
    fireEvent.click(screen.getByDisplayValue('Desk'));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('starts a drag from the resting title, never from the open editor', () => {
    const onPointerDown = vi.fn();
    const ref = createRef<EditableTextHandle>();
    render(
      <CollapsibleSection
        title="Desk" ariaLabel="Desk" open onToggle={() => {}} onTitleRename={() => {}} titleRenameRef={ref}
        drag={{ ref: () => {}, style: {}, attributes: {}, listeners: { onPointerDown }, isDragging: false, placeholderClassName: '' }}
      >
        <div>body</div>
      </CollapsibleSection>,
    );
    fireEvent.pointerDown(screen.getByText('Desk'));
    expect(onPointerDown).toHaveBeenCalledTimes(1);
    act(() => ref.current!.startEditing());
    fireEvent.pointerDown(screen.getByDisplayValue('Desk'));
    expect(onPointerDown).toHaveBeenCalledTimes(1);
  });
});

describe('CollapsibleSection plain title', () => {
  it('toggles from the title like the rest of the bar', () => {
    const onToggle = vi.fn();
    render(
      <CollapsibleSection title="Sensors" open onToggle={onToggle}>
        <div>body</div>
      </CollapsibleSection>,
    );
    fireEvent.click(screen.getByText('Sensors'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
