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
const mockPush = vi.fn();

vi.mock('../../common/Toast/Toast', () => ({
  useToast: () => ({ push: mockPush }),
}));

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
    { category: 'cpu', sensor: 'cpu-temp', label: '', resolvedCategory: 'cpu', resolvedSensor: 'cpu-temp' },
    { category: '', sensor: '', label: 'Fan', resolvedCategory: 'motherboard', resolvedSensor: 'mb-temp' },
    { category: '', sensor: '', label: '', resolvedCategory: 'gpu', resolvedSensor: 'gpu-hot' },
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

  it('an unpicked slot shows its resolved sensor', async () => {
    await mount();
    expect(screen.getAllByTestId('sensor-picker')[1].textContent).toBe('motherboard/mb-temp');
  });

  it('picking a sensor replaces that slot and keeps its label', async () => {
    await mount();
    await act(async () => {
      fireEvent.click(screen.getAllByTestId('sensor-picker')[1]);
    });
    expect(mockSet).toHaveBeenCalledWith({
      slots: [
        { category: 'cpu', sensor: 'cpu-temp', label: '' },
        { category: 'gpu', sensor: 'gpu-temp', label: 'Fan' },
        { category: '', sensor: '', label: '' },
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

  it('shows the error toast and refetches when the save is refused', async () => {
    await mount();
    mockSet.mockResolvedValue(false);
    mockGet.mockClear();
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'devices.asus-glacial-lcd.stayOn' }));
    });
    expect(mockPush).toHaveBeenCalledWith({ title: 'devices.asus-glacial-lcd.failedTitle', body: 'devices.asus-glacial-lcd.failedBody' });
    expect(mockGet).toHaveBeenCalled();
  });

  it('shows the error toast when the save throws', async () => {
    await mount();
    mockSet.mockRejectedValue(new Error('network'));
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'devices.asus-glacial-lcd.modePicture' }));
    });
    expect(mockPush).toHaveBeenCalled();
  });

  it('disables the controls while the device is not connected', async () => {
    await mount({ ...base, isConnected: false });
    expect(screen.getByRole('switch', { name: 'devices.asus-glacial-lcd.displayOn' })).toBeDisabled();
  });
});
