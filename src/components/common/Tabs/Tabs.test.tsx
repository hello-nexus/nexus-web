import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Tabs } from './Tabs';

describe('Tabs', () => {
  it('renders every tab label', () => {
    render(
      <Tabs
        tabs={[{ key: 'one', label: 'One' }, { key: 'two', label: 'Two' }]}
        activeKey="one"
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('One')).toBeInTheDocument();
    expect(screen.getByText('Two')).toBeInTheDocument();
  });

  it('fires onChange with the tab key on click', () => {
    const onChange = vi.fn();
    render(
      <Tabs
        tabs={[{ key: 'one', label: 'One' }, { key: 'two', label: 'Two' }]}
        activeKey="one"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText('Two'));
    expect(onChange).toHaveBeenCalledWith('two', expect.any(HTMLButtonElement));
  });

  it('omits the trailing slot when a tab has no trailing node', () => {
    render(
      <Tabs
        tabs={[{ key: 'one', label: 'One' }]}
        activeKey="one"
        onChange={() => {}}
      />,
    );
    expect(screen.queryByTestId('trailing')).not.toBeInTheDocument();
  });

  it('renders a trailing node and stops its click from reaching onChange', () => {
    const onChange = vi.fn();
    const onTrailingClick = vi.fn();
    render(
      <Tabs
        tabs={[{
          key: 'one', label: 'One',
          trailing: <span data-testid="trailing" onClick={onTrailingClick}>*</span>,
        }]}
        activeKey="one"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId('trailing'));
    expect(onTrailingClick).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders the trailing node as a sibling of the tab button, never nested inside it', () => {
    render(
      <Tabs
        tabs={[{
          key: 'one', label: 'One',
          trailing: <span data-testid="trailing">*</span>,
        }]}
        activeKey="one"
        onChange={() => {}}
      />,
    );
    const trailing = screen.getByTestId('trailing');
    const tabButton = screen.getByRole('tab', { name: 'One' });
    // A focusable control nested inside a <button> is invalid ARIA and, for a
    // literal <button>, invalid HTML - the trailing control must sit outside
    // the tab button's subtree, not inside it.
    expect(tabButton.contains(trailing)).toBe(false);
  });

  it('keeps a tab with no trailing node as a bare button (no extra wrapper)', () => {
    render(
      <Tabs
        tabs={[{ key: 'one', label: 'One' }]}
        activeKey="one"
        onChange={() => {}}
      />,
    );
    const tabButton = screen.getByRole('tab', { name: 'One' });
    expect(tabButton.parentElement).toHaveAttribute('role', 'tablist');
  });
});
