import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RailSearchButton, RailSearchField, useRailSearch } from './RailSearch';

function Harness() {
  const search = useRailSearch();
  return (
    <>
      <RailSearchButton open={search.open} onToggle={search.toggle} label="Search devices" />
      {search.open && (
        <RailSearchField query={search.query} onChange={search.setQuery} onClose={search.close} placeholder="Name or group..." />
      )}
      <output>{search.active ? `filtering:${search.query}` : 'idle'}</output>
    </>
  );
}

describe('RailSearch', () => {
  it('opens a focused field from the looking glass and filters while it holds text', () => {
    render(<Harness />);
    expect(screen.queryByRole('textbox')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Search devices' }));
    const field = screen.getByRole('textbox');
    expect(document.activeElement).toBe(field);
    expect(screen.getByRole('button', { name: 'Search devices' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.change(field, { target: { value: 'lian strimer' } });
    expect(screen.getByRole('status').textContent).toBe('filtering:lian strimer');
  });

  it('clears the query when closed, by the button or by Escape', () => {
    render(<Harness />);
    const button = screen.getByRole('button', { name: 'Search devices' });

    fireEvent.click(button);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'kraken' } });
    fireEvent.click(button);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('idle');

    fireEvent.click(button);
    expect(screen.getByRole<HTMLInputElement>('textbox').value).toBe('');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'kraken' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('idle');
  });

  it('does not filter on a blank query', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Search devices' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } });
    expect(screen.getByRole('status').textContent).toBe('idle');
  });
});
