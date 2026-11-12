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

let devices: Array<{ id: string; supportsNexusControl?: boolean; nexusControlEnabled?: boolean }> = [];
vi.mock('../../../hooks/useDevices', () => ({
  useDevices: () => ({ devices }),
}));

describe('RamTemperatureSection', () => {
  beforeEach(() => {
    update.mockClear();
    uiSettings.readRamTemperatures = true;
    devices = [];
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

  it('stays enabled while the Memory device control is on', () => {
    devices = [{ id: 'smbus-dram', supportsNexusControl: true, nexusControlEnabled: true }];
    render(<RamTemperatureSection serviceOnline />);
    expect(screen.getByRole('switch', { name: /settings.ramTemperatures.label/ })).toBeEnabled();
    expect(screen.queryByText('settings.ramTemperatures.busOff')).not.toBeInTheDocument();
  });

  it('disables the toggle and explains when the Memory device control is off', () => {
    devices = [{ id: 'smbus-dram', supportsNexusControl: true, nexusControlEnabled: false }];
    const open = vi.fn();
    render(<RamTemperatureSection serviceOnline onOpenDevices={open} />);
    expect(screen.getByRole('switch', { name: /settings.ramTemperatures.label/ })).toBeDisabled();
    expect(screen.getByText('settings.ramTemperatures.busOff')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'settings.ramTemperatures.openDevices' }));
    expect(open).toHaveBeenCalledTimes(1);
  });
});
