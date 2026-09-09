import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FanGroupHeader } from './FanGroupHeader';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    language: 'en',
  }),
}));

function renderHeader(over: Partial<Parameters<typeof FanGroupHeader>[0]> = {}) {
  const props = {
    name: 'Radiator',
    count: 3,
    collapsed: false,
    onToggleCollapsed: vi.fn(),
    groupControlled: true,
    onToggleControlled: vi.fn(),
    groupLocked: false,
    onToggleLock: vi.fn(),
    children: <div>fan</div>,
    ...over,
  };
  render(<FanGroupHeader {...props} />);
  return props;
}

const openMenu = () => fireEvent.click(screen.getByRole('button', { name: /groupActions/ }));

describe('FanGroupHeader menu', () => {
  it('names the action for a controlled, unlocked group', () => {
    renderHeader();
    openMenu();
    expect(screen.getByRole('button', { name: /menuControlOff/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /lock\.lock/ })).toBeTruthy();
  });

  it('flips both rows when the group is released and locked', () => {
    renderHeader({ groupControlled: false, groupLocked: true });
    openMenu();
    expect(screen.getByRole('button', { name: /menuControlOn/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /lock\.unlock/ })).toBeTruthy();
  });

  it('drives the group handlers', () => {
    const props = renderHeader();
    openMenu();
    fireEvent.click(screen.getByRole('button', { name: /menuControlOff/ }));
    expect(props.onToggleControlled).toHaveBeenCalledTimes(1);
  });

  it('offers no delete on a hardware group', () => {
    renderHeader();
    openMenu();
    expect(screen.queryByRole('button', { name: /groupDelete/ })).toBeNull();
  });

  it('offers delete on a user-made group', () => {
    const onDelete = vi.fn();
    renderHeader({ onDelete });
    openMenu();
    fireEvent.click(screen.getByRole('button', { name: /groupDelete/ }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});

describe('FanGroupHeader title', () => {
  it('commits a trimmed rename on Enter', () => {
    const onRename = vi.fn();
    renderHeader({ onRename });
    fireEvent.click(screen.getByText('Radiator'));
    const input = screen.getByDisplayValue('Radiator');
    fireEvent.change(input, { target: { value: '  Top rad  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRename).toHaveBeenCalledWith('Top rad');
  });

  it('does not collapse the group when the title is clicked', () => {
    const props = renderHeader({ onRename: vi.fn() });
    fireEvent.click(screen.getByText('Radiator'));
    expect(props.onToggleCollapsed).not.toHaveBeenCalled();
  });

  it('shows the member count', () => {
    renderHeader();
    expect(screen.getByText('3')).toBeTruthy();
  });
});
