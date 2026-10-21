import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RamTemperatureSection } from './RamTemperatureSection';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const update = vi.fn();
// The provider always supplies a value (default true) before the row renders.
const uiSettings = { readRamTemperatures: true };
vi.mock('../../../hooks/useUiSettings', () => ({
  useUiSettings: () => ({ settings: uiSettings, update }),
}));

describe('RamTemperatureSection', () => {
  beforeEach(() => {
    update.mockClear();
    uiSettings.readRamTemperatures = true;
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
