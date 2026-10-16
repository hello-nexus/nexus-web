import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RamTemperatureSection } from './RamTemperatureSection';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const update = vi.fn();
const uiSettings: { readRamTemperatures?: boolean } = {};
vi.mock('../../../hooks/useUiSettings', () => ({
  useUiSettings: () => ({ settings: uiSettings, update }),
}));

describe('RamTemperatureSection', () => {
  beforeEach(() => {
    update.mockClear();
    delete uiSettings.readRamTemperatures;
  });

  it('is on when the field is absent', () => {
    render(<RamTemperatureSection serviceOnline />);
    expect(screen.getByRole('switch', { name: /settings.ramTemperatures.label/ })).toBeChecked();
  });

  it('writes readRamTemperatures=false when toggled off', () => {
    render(<RamTemperatureSection serviceOnline />);
    fireEvent.click(screen.getByRole('switch', { name: /settings.ramTemperatures.label/ }));
    expect(update).toHaveBeenCalledWith({ readRamTemperatures: false });
  });

  it('writes true when toggled back on', () => {
    uiSettings.readRamTemperatures = false;
    render(<RamTemperatureSection serviceOnline />);
    fireEvent.click(screen.getByRole('switch', { name: /settings.ramTemperatures.label/ }));
    expect(update).toHaveBeenCalledWith({ readRamTemperatures: true });
  });
});
