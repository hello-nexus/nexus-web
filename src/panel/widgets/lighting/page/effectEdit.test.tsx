import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { AnimateGrid } from './AnimateGrid';
import { effectEditEnabled } from './effectEdit';

describe('effectEditEnabled', () => {
  it('is on for a per-device pinned effect while the dock is collapsed', () => {
    expect(effectEditEnabled(true, 'plasma')).toBe(true);
  });
  it('is off with the dock open or no selected tile', () => {
    expect(effectEditEnabled(false, 'plasma')).toBe(false);
    expect(effectEditEnabled(true, '')).toBe(false);
  });
  it('shows the pencil and opens the editor for a device-selected effect', () => {
    const onEdit = vi.fn();
    const { container } = render(
      <AnimateGrid effect="plasma" onSelect={() => {}} onEdit={onEdit} editEnabled={effectEditEnabled(true, 'plasma')} slotFor={() => 0} versionFor={() => '0'} />,
    );
    expect(container.querySelectorAll('[data-edit-hint-overlay]').length).toBe(1);
    fireEvent.click(container.querySelector('[data-effect-key="plasma"]')!);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
