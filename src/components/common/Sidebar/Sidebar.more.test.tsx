import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Sidebar } from './Sidebar';
import type { ServiceState } from '../../../hooks/useServiceState';

const SERVICE_STATE: ServiceState = { cooling: null, lighting: null, panel: null };
const ITEMS = [{ key: 'monitoring', label: 'Monitoring', icon: null }];
const LOWER = [
  { key: 'clock', label: 'Clock', icon: null },
  { key: 'steam', label: 'Steam', icon: null },
  { key: 'weather', label: 'Weather', icon: null },
];

function more(over: Partial<NonNullable<Parameters<typeof Sidebar>[0]['more']>> = {}) {
  return { collapsedKeys: ['steam'], expanded: false, onToggle: vi.fn(), showLabel: 'Show more', hideLabel: 'Show less', ...over };
}

function renderSidebar(props: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  return render(
    <Sidebar
      items={ITEMS}
      active="monitoring"
      onChange={vi.fn()}
      sectionLabel="Apps"
      serviceState={SERVICE_STATE}
      lowerItems={LOWER}
      {...props}
    />,
  );
}

const shell = (key: string) => document.querySelector(`[data-sidebar-row-key="${key}"]`)!.closest('[class*="rowShell"]:not([class*="rowShellInner"])');
const lowerOrder = () => [...document.querySelectorAll('[data-sidebar-row-key]')].map(el => el.getAttribute('data-sidebar-row-key'));

describe('Sidebar Show more', () => {
  it('renders no toggle without more, or with nothing collapsed away', () => {
    renderSidebar();
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
    renderSidebar({ more: more({ collapsedKeys: ['clock', 'steam', 'weather'] }) });
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
  });

  it('collapsed: only the collapsed keys show; the rest stay in order but inert', () => {
    const onToggle = vi.fn();
    renderSidebar({ more: more({ onToggle }), onArrange: vi.fn() });
    const toggle = screen.getByRole('button', { name: 'Show more' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(shell('steam')).not.toHaveAttribute('inert');
    expect(shell('clock')).toHaveAttribute('inert');
    expect(shell('weather')).toHaveAttribute('inert');
    expect(lowerOrder()).toEqual(['monitoring', 'clock', 'steam', 'weather']);
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  // The recent row keeps its slot rather than jumping above the others.
  it('expanded: every lower row shows in the given order and navigates', () => {
    const onChange = vi.fn();
    renderSidebar({ onChange, more: more({ expanded: true }), onArrange: vi.fn() });
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true');
    for (const key of ['clock', 'steam', 'weather']) expect(shell(key)).not.toHaveAttribute('inert');
    expect(lowerOrder()).toEqual(['monitoring', 'clock', 'steam', 'weather']);
    fireEvent.click(screen.getByRole('button', { name: 'Weather' }));
    expect(onChange).toHaveBeenCalledWith('weather');
  });

  it('renders the separator whenever there are lower rows, in both branches', () => {
    const { container, unmount } = renderSidebar({ more: more() });
    expect(container.querySelector('[class*="runningSeparator"]')).toBeInTheDocument();
    unmount();
    const sortable = renderSidebar({ more: more(), onArrange: vi.fn() });
    expect(sortable.container.querySelector('[data-sidebar-running-separator]')).toBeInTheDocument();
  });

  it('renders no separator with no lower rows', () => {
    const { container } = renderSidebar({ lowerItems: [], onArrange: vi.fn() });
    expect(container.querySelector('[data-sidebar-running-separator]')).not.toBeInTheDocument();
  });
});
