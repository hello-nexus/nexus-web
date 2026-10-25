import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { AnimateGrid } from './AnimateGrid';
import { effectEditEnabled } from './effectEdit';

describe('effectEditEnabled', () => {
  it('is on for a device selection whatever the global tab state', () => {
    expect(effectEditEnabled(true, 'plasma', true, false)).toBe(true);
    expect(effectEditEnabled(true, 'plasma', true, true)).toBe(true);
  });
  it('is on with nothing selected only on the live global tab', () => {
    expect(effectEditEnabled(true, 'plasma', false, true)).toBe(true);
    expect(effectEditEnabled(true, 'plasma', false, false)).toBe(false);
  });
  it('is off with the dock open or no selected tile', () => {
    expect(effectEditEnabled(false, 'plasma', true, true)).toBe(false);
    expect(effectEditEnabled(true, '', true, true)).toBe(false);
  });
  it('shows the pencil and opens the editor for a device-selected effect', () => {
    const onEdit = vi.fn();
    const { container } = render(
      <AnimateGrid effect="plasma" onSelect={() => {}} onEdit={onEdit} editEnabled={effectEditEnabled(true, 'plasma', true, false)} slotFor={() => 0} versionFor={() => '0'} />,
    );
    expect(container.querySelectorAll('[data-edit-hint-overlay]').length).toBe(1);
    fireEvent.click(container.querySelector('[data-effect-key="plasma"]')!);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
