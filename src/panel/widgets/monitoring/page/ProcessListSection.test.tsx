import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ProcessListSection, type ProcessListItem } from './ProcessListSection';

function items(): ProcessListItem[] {
  return [
    { name: 'Chrome', color: '#f00', current: 12, values: [1, 2, 3] },
    { name: 'PixelForge', color: '#0f0', current: 40, values: [4, 5, 6] },
    { name: 'Nexus', color: '#00f', current: 3, values: [1, 1, 1] },
  ];
}

describe('ProcessListSection', () => {
  it('renders rows sorted by usage (current value) descending by default', () => {
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} />);
    const names = screen.getAllByText(/Chrome|PixelForge|Nexus/).map(el => el.textContent);
    expect(names).toEqual(['PixelForge', 'Chrome', 'Nexus']);
  });

  it('filters rows live by name via the search input', () => {
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} />);
    fireEvent.change(screen.getByPlaceholderText('monitoring.history.process.searchPlaceholder'), { target: { value: 'chr' } });
    expect(screen.getByText('Chrome')).toBeInTheDocument();
    expect(screen.queryByText('PixelForge')).toBeNull();
    expect(screen.queryByText('Nexus')).toBeNull();
  });

  it('search is case-insensitive', () => {
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} />);
    fireEvent.change(screen.getByPlaceholderText('monitoring.history.process.searchPlaceholder'), { target: { value: 'NEXUS' } });
    expect(screen.getByText('Nexus')).toBeInTheDocument();
  });

  it('switches to alphabetical sort via the sort dropdown', () => {
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} />);
    fireEvent.click(screen.getByRole('button', { name: 'monitoring.history.process.sortAriaLabel' }));
    fireEvent.click(screen.getByRole('option', { name: 'monitoring.history.process.sortName' }));
    const names = screen.getAllByText(/Chrome|PixelForge|Nexus/).map(el => el.textContent);
    expect(names).toEqual(['PixelForge', 'Chrome', 'Nexus']);
  });

  it('shows the current value formatted via formatValue', () => {
    render(<ProcessListSection items={[items()[0]]} formatValue={v => `${v}%`} />);
    expect(screen.getByText('12%')).toBeInTheDocument();
  });

  it('renders an optional secondary value inline', () => {
    render(<ProcessListSection items={[{ ...items()[0], secondary: '512 MB' }]} formatValue={v => `${v}%`} />);
    expect(screen.getByText('512 MB')).toBeInTheDocument();
  });

  it('omits the secondary value when absent', () => {
    const { container } = render(<ProcessListSection items={[items()[0]]} formatValue={v => `${v}%`} />);
    expect(container.textContent).not.toContain('undefined');
  });

  it('shows the empty message when no items match', () => {
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} />);
    fireEvent.change(screen.getByPlaceholderText('monitoring.history.process.searchPlaceholder'), { target: { value: 'zzz' } });
    expect(screen.getByText('monitoring.ranked.empty')).toBeInTheDocument();
  });

  it('shows the empty message for an empty item list', () => {
    render(<ProcessListSection items={[]} formatValue={v => `${v}%`} />);
    expect(screen.getByText('monitoring.ranked.empty')).toBeInTheDocument();
  });
});
