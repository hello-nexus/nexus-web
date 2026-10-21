import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WeatherLocationSearch } from './WeatherLocationSearch';

const api = vi.hoisted(() => ({ geocodeWeatherLocations: vi.fn() }));
vi.mock('../../../api/weather', () => api);
vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ language: 'en', t: (key: string) => key }),
}));

const ROME = { name: 'Rome', admin1: '', country: 'Italy', countryCode: 'IT', latitude: 41.9, longitude: 12.5 };

describe('WeatherLocationSearch disabled', () => {
  beforeEach(() => {
    api.geocodeWeatherLocations.mockReset().mockResolvedValue({ results: [ROME] });
  });

  it('drops the query and results when it turns off, and cannot be picked from', async () => {
    const onSelect = vi.fn();
    const { rerender } = render(<WeatherLocationSearch hasKeyboard onSelect={onSelect} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Rom' } });
    expect(await screen.findByText('Rome, Italy')).toBeInTheDocument();

    rerender(<WeatherLocationSearch hasKeyboard disabled onSelect={onSelect} />);
    await waitFor(() => expect(screen.queryByText('Rome, Italy')).not.toBeInTheDocument());
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(onSelect).not.toHaveBeenCalled();
  });
});
