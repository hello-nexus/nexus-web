import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MotherboardGroup } from './MotherboardGroup';

// Params are appended so assertions can pin what actually reaches a label -
// a bare `key` mock would pass even if the interpolation object were dropped.
vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}));

function renderGroup(over: Partial<Parameters<typeof MotherboardGroup>[0]> = {}) {
  const props = {
    parentName: 'Test Board',
    groupOn: true,
    onTogglePower: vi.fn(),
    groupControlled: true,
    onToggleControlled: vi.fn(),
    collapsed: false,
    onToggleCollapsed: vi.fn(),
    children: <div>zone</div>,
    ...over,
  };
  render(<MotherboardGroup {...props} />);
  return props;
}

const menuButton = () => screen.getByRole('button', { name: /groupActions/ });
const openMenu = () => fireEvent.click(menuButton());

describe('MotherboardGroup actions menu', () => {
  it('replaces the icon switches with one overflow button', () => {
    renderGroup();
    expect(screen.queryByRole('switch')).toBeNull();
    // The group name reaches the label, so multiple headers are distinguishable.
    expect(menuButton().getAttribute('aria-label')).toContain('"name":"Test Board"');
  });

  it('names the action for a group that is on and controlled', () => {
    renderGroup();
    openMenu();
    expect(screen.getByRole('button', { name: /menuControlOff/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /menuLightsOff/ })).toBeTruthy();
  });

  it('flips both rows for a group that is off and released', () => {
    renderGroup({ groupOn: false, groupControlled: false });
    openMenu();
    expect(screen.getByRole('button', { name: /menuControlOn/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /menuLightsOn/ })).toBeTruthy();
  });

  it('fires the group handlers', () => {
    const props = renderGroup();
    openMenu();
    fireEvent.click(screen.getByRole('button', { name: /menuLightsOff/ }));
    expect(props.onTogglePower).toHaveBeenCalledTimes(1);
  });

  it('leaves the group expanded and its rows reachable after opening the menu', () => {
    const props = renderGroup();
    openMenu();
    expect(props.onToggleCollapsed).not.toHaveBeenCalled();
    expect(screen.getByText('zone')).toBeTruthy();
    expect(screen.getByRole('button', { name: /menuControlOff/ })).toBeTruthy();
  });
});

describe('MotherboardGroup rename', () => {
  const startRename = () => {
    openMenu();
    fireEvent.click(screen.getByText(/devices\.rename/));
  };

  it('commits the trimmed header name on Enter', () => {
    const onRename = vi.fn();
    renderGroup({ onRename });
    startRename();
    const input = screen.getByDisplayValue('Test Board');
    fireEvent.change(input, { target: { value: '  Motherboard  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRename).toHaveBeenCalledWith('Motherboard');
  });

  it('does not start a rename when the title is clicked', () => {
    renderGroup({ onRename: vi.fn() });
    fireEvent.click(screen.getByText('Test Board'));
    expect(screen.queryByDisplayValue('Test Board')).toBeNull();
  });

  it('collapses the group when the title is clicked', () => {
    const props = renderGroup({ onRename: vi.fn() });
    fireEvent.click(screen.getByText('Test Board'));
    expect(props.onToggleCollapsed).toHaveBeenCalled();
  });

  it('keeps the chevron collapsing the group', () => {
    const props = renderGroup({ onRename: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: /motherboardHeader/ }));
    expect(props.onToggleCollapsed).toHaveBeenCalledTimes(1);
  });

  it('leaves the title a plain label with no rename handler', () => {
    renderGroup();
    fireEvent.click(screen.getByText('Test Board'));
    expect(screen.queryByDisplayValue('Test Board')).toBeNull();
  });
});

