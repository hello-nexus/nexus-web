import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DeckWeatherCell } from './DeckWeatherCell';
import { PanelPreviewProvider } from '../common/PanelPreviewContext';
import type { DeckAction } from './types';
import styles from './DeckWeatherCell.module.scss';

// countryCode 'US' so the default (units: 'auto') resolves Fahrenheit per
// resolveUnit's FAHRENHEIT_COUNTRIES heuristic, matching the fixture the
// weather widget's own tests use.
const mockSnapshot = vi.hoisted(() => ({
  build: (overrides: Record<string, unknown> = {}) => ({
    temperatureC: 22,
    temperatureF: 72,
    weatherCode: 1,
    locationLabel: 'Berlin',
    countryCode: 'US',
    ...overrides,
  }),
}));

const fetchServiceMock = vi.hoisted(() => vi.fn(() => Promise.resolve(mockSnapshot.build())));

vi.mock('../../../api/service', () => ({
  fetchService: fetchServiceMock,
}));

function weatherAction(overrides: Partial<Extract<DeckAction, { type: 'weather' }>> = {}): Extract<DeckAction, { type: 'weather' }> {
  return { type: 'weather', units: 'auto', ...overrides };
}

describe('DeckWeatherCell preview mode', () => {
  it('renders the frozen preview fixture without fetching', () => {
    render(
      <PanelPreviewProvider value>
        <DeckWeatherCell action={weatherAction()} />
      </PanelPreviewProvider>,
    );
    expect(screen.getByText('22°')).toBeInTheDocument();
    expect(screen.getByText('San Francisco')).toBeInTheDocument();
    expect(fetchServiceMock).not.toHaveBeenCalled();
  });
});

describe('DeckWeatherCell live mode', () => {
  afterEach(() => vi.clearAllMocks());

  it('fetches with an empty query for an auto (no lat/lon) location', async () => {
    render(<DeckWeatherCell action={weatherAction()} />);
    expect(await screen.findByText('72°')).toBeInTheDocument();
    expect(fetchServiceMock).toHaveBeenCalledWith('/api/weather');
  });

  it('fetches with the action location query when lat/lon are set', async () => {
    render(<DeckWeatherCell action={weatherAction({ lat: 52.5, lon: 13.4, city: 'Berlin', cc: 'DE' })} />);
    await screen.findByText('Berlin');
    const calledPath = fetchServiceMock.mock.calls[0][0] as string;
    expect(calledPath).toContain('/api/weather?');
    expect(calledPath).toContain('lat=52.5');
    expect(calledPath).toContain('lon=13.4');
  });

  it('prefers the action-stored city over the fetched locationLabel', async () => {
    fetchServiceMock.mockResolvedValueOnce(mockSnapshot.build({ locationLabel: 'Fetched City' }));
    render(<DeckWeatherCell action={weatherAction({ lat: 52.5, lon: 13.4, city: 'My Berlin', cc: 'DE' })} />);
    expect(await screen.findByText('My Berlin')).toBeInTheDocument();
    expect(screen.queryByText('Fetched City')).toBeNull();
  });

  it('falls back to the snapshot locationLabel when the action has no city', async () => {
    render(<DeckWeatherCell action={weatherAction({ lat: 52.5, lon: 13.4 })} />);
    expect(await screen.findByText('Berlin')).toBeInTheDocument();
  });

  it('shows Fahrenheit when units is auto and the resolved country is Fahrenheit-using', async () => {
    render(<DeckWeatherCell action={weatherAction({ units: 'auto' })} />);
    expect(await screen.findByText('72°')).toBeInTheDocument();
  });

  it('shows Celsius when units is explicitly C, overriding the auto country heuristic', async () => {
    render(<DeckWeatherCell action={weatherAction({ units: 'C' })} />);
    expect(await screen.findByText('22°')).toBeInTheDocument();
  });
});

describe('DeckWeatherCell title styling', () => {
  it('applies the title text color to both the temperature and city text', async () => {
    const { container } = render(<DeckWeatherCell action={weatherAction()} title={{ color: 'rgb(1, 2, 3)' }} />);
    await screen.findByText('72°');
    const temp = container.querySelector(`.${styles.temp}`) as HTMLElement;
    const city = container.querySelector(`.${styles.city}`) as HTMLElement;
    expect(temp.style.color).toBe('rgb(1, 2, 3)');
    expect(city.style.color).toBe('rgb(1, 2, 3)');
  });
});
