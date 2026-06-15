import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ClockWorldView } from './ClockWorldView';
import { DEFAULT_CITY_IDS } from './cities';

// No I18nProvider in scope, so t() returns the raw key - assertions target
// keys (chrome) and city names (data), both deterministic.
const STORAGE_KEY = 'clock.cities';
const stored = (): string[] => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('ClockWorldView', () => {
  it('seeds the default cities and persists the selection', () => {
    render(<ClockWorldView />);

    // Card titles are headings; the map also draws each name as an SVG label,
    // so query the heading to target the list card unambiguously. Regex match
    // tolerates the "Local" badge appended to whichever card is the runner's tz.
    expect(screen.getByRole('heading', { name: /Los Angeles/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Tokyo/ })).toBeInTheDocument();
    expect(stored()).toEqual([...DEFAULT_CITY_IDS]);
  });

  it('removes a city from the list and from storage', () => {
    render(<ClockWorldView />);

    // First default entry is Los Angeles; first remove button removes it.
    const removeButtons = screen.getAllByRole('button', { name: 'clock.app.remove' });
    expect(removeButtons).toHaveLength(DEFAULT_CITY_IDS.length);
    fireEvent.click(removeButtons[0]);

    expect(screen.queryByText('Los Angeles')).not.toBeInTheDocument();
    expect(stored()).not.toContain('los-angeles');
    expect(stored()).toHaveLength(DEFAULT_CITY_IDS.length - 1);
  });

  it('adds a catalog city via the picker', () => {
    render(<ClockWorldView />);
    expect(screen.queryByRole('heading', { name: /Berlin/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'clock.app.addCity' }));
    fireEvent.change(screen.getByPlaceholderText('clock.app.searchCities'), {
      target: { value: 'berlin' },
    });
    // The picker result is a heading inside a clickable card; the click bubbles
    // to the card. Adding it moves Berlin into the list (and the map).
    fireEvent.click(screen.getByRole('heading', { name: /Berlin/ }));

    expect(stored()).toContain('berlin');
    expect(screen.getByRole('heading', { name: /Berlin/ })).toBeInTheDocument();
  });

  it('shows the empty state when every city is removed', () => {
    render(<ClockWorldView />);

    // Re-query each pass: removing a city re-renders and detaches the old nodes.
    let buttons = screen.queryAllByRole('button', { name: 'clock.app.remove' });
    while (buttons.length > 0) {
      fireEvent.click(buttons[0]);
      buttons = screen.queryAllByRole('button', { name: 'clock.app.remove' });
    }

    expect(screen.getByText('clock.app.empty')).toBeInTheDocument();
    expect(stored()).toEqual([]);
  });
});
