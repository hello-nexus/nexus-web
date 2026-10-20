import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AsusGlacialLcdDevicePage } from './AsusGlacialLcdDevicePage';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));

const mockGet = vi.fn();
const mockSet = vi.fn();

vi.mock('../../../api/asus-glacial-lcd', () => ({
  getGlacialState: () => mockGet(),
  setGlacialSettings: (patch: unknown) => mockSet(patch),
}));

vi.mock('../../../panel/widgets/monitoring/picker/SensorPicker', () => ({
  useSensorLookup: () => ({}),
  SensorPicker: ({ category, sensor, onChange }: { category: string; sensor: string; onChange: (s: { category: string; sensor: string }) => void }) => (
    <button type="button" data-testid="sensor-picker" onClick={() => onChange({ category: 'gpu', sensor: 'gpu-temp' })}>
      {category}/{sensor}
    </button>
  ),
}));

const base = {
  isConnected: true,
  displayOn: true,
  mode: 'monitor',
  staticAsset: 3,
  animatedAsset: 0,
  slotCount: 2,
  slots: [
    { category: 'cpu', sensor: 'cpu-temp', label: '' },
    { category: '', sensor: '', label: '' },
    { category: '', sensor: '', label: '' },
  ],
  brightness: 60,
  stayOnWhileAsleep: false,
  staticAssets: [3, 4],
  animatedAssets: [0, 1],
};

async function mount(state = base) {
  mockGet.mockResolvedValue(state);
  await act(async () => {
    render(<AsusGlacialLcdDevicePage />);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSet.mockResolvedValue(true);
});

describe('AsusGlacialLcdDevicePage', () => {
  it('monitor mode shows one picker per visible widget and no asset select', async () => {
    await mount();
    expect(screen.getAllByTestId('sensor-picker')).toHaveLength(2);
    expect(screen.queryByText('devices.asus-glacial-lcd.picture')).toBeNull();
  });

  it('picture mode shows the picture presets and hides the widgets', async () => {
    await mount({ ...base, mode: 'static' });
    expect(screen.queryAllByTestId('sensor-picker')).toHaveLength(0);
    expect(screen.getByText('devices.asus-glacial-lcd.picture')).toBeTruthy();
  });

  it('animation mode shows the animation select', async () => {
    await mount({ ...base, mode: 'animated' });
    expect(screen.getByText('devices.asus-glacial-lcd.animation')).toBeTruthy();
  });

  it('changing mode sends the mode', async () => {
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'devices.asus-glacial-lcd.modePicture' }));
    });
    expect(mockSet).toHaveBeenCalledWith({ mode: 'static' });
  });

  it('the widget count sends slotCount', async () => {
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: '3' }));
    });
    expect(mockSet).toHaveBeenCalledWith({ slotCount: 3 });
  });

  it('picking a sensor replaces that slot and leaves its label empty', async () => {
    await mount();
    await act(async () => {
      fireEvent.click(screen.getAllByTestId('sensor-picker')[1]);
    });
    expect(mockSet).toHaveBeenCalledWith({
      slots: [
        base.slots[0],
        { category: 'gpu', sensor: 'gpu-temp', label: '' },
        base.slots[2],
      ],
    });
  });

  it('the stay-on switch sends stayOnWhileAsleep', async () => {
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'devices.asus-glacial-lcd.stayOn' }));
    });
    expect(mockSet).toHaveBeenCalledWith({ stayOnWhileAsleep: true });
  });

  it('disables the controls while the device is not connected', async () => {
    await mount({ ...base, isConnected: false });
    expect(screen.getByRole('switch', { name: 'devices.asus-glacial-lcd.displayOn' })).toBeDisabled();
  });
});
