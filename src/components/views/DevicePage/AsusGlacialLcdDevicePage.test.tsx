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
  useSensorLookup: () => ({
    resolve: (category: string, sensor: string) => (sensor ? { name: `name-${category}-${sensor}` } : undefined),
  }),
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
  modeChosen: true,
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

  it('picking a sensor in a slot with a default label sends an empty label', async () => {
    await mount();
    await act(async () => {
      fireEvent.click(screen.getAllByTestId('sensor-picker')[1]);
    });
    expect(mockSet).toHaveBeenCalledWith({
      slots: [
        { category: 'cpu', sensor: 'cpu-temp', label: '' },
        { category: 'gpu', sensor: 'gpu-temp', label: '' },
        { category: '', sensor: '', label: '' },
      ],
    });
  });

  it('shows no mode selection and no sub-controls until a mode is chosen', async () => {
    await mount({ ...base, modeChosen: false });
    for (const m of ['Monitor', 'Animation', 'Picture']) {
      expect(screen.getByRole('radio', { name: `devices.asus-glacial-lcd.mode${m}` })).toHaveAttribute('aria-checked', 'false');
    }
    expect(screen.queryAllByTestId('sensor-picker')).toHaveLength(0);
    expect(screen.queryByText('devices.asus-glacial-lcd.widgetCount')).toBeNull();
  });

  it('hides the asset select until a mode is chosen', async () => {
    await mount({ ...base, mode: 'static', modeChosen: false });
    expect(screen.queryByText('devices.asus-glacial-lcd.picture')).toBeNull();
  });

  it('a mode chip click shows its rows before the refetch resolves', async () => {
    await mount({ ...base, mode: 'static', modeChosen: false });
    let release: (v: unknown) => void = () => {};
    mockGet.mockReturnValue(new Promise(r => { release = r; }));
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'devices.asus-glacial-lcd.modeMonitor' }));
    });
    expect(mockSet).toHaveBeenCalledWith({ mode: 'monitor' });
    expect(screen.getByRole('radio', { name: 'devices.asus-glacial-lcd.modeMonitor' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getAllByTestId('sensor-picker').length).toBeGreaterThan(0);
    await act(async () => { release({ ...base, modeChosen: true }); });
  });

  it('turning the display on before a mode is chosen selects the first-run animation', async () => {
    await mount({ ...base, displayOn: false, modeChosen: false });
    let release: (v: unknown) => void = () => {};
    mockGet.mockReturnValue(new Promise(r => { release = r; }));
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'devices.asus-glacial-lcd.displayOn' }));
    });
    expect(mockSet).toHaveBeenCalledWith({ displayOn: true });
    expect(screen.getByRole('radio', { name: 'devices.asus-glacial-lcd.modeAnimation' })).toHaveAttribute('aria-checked', 'true');
    await act(async () => { release({ ...base, displayOn: true, mode: 'animated', animatedAsset: 1, modeChosen: true }); });
  });

  it('rolls the chosen mode back when the save is refused', async () => {
    await mount({ ...base, modeChosen: false });
    mockSet.mockResolvedValue(false);
    mockGet.mockResolvedValue({ ...base, modeChosen: false });
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'devices.asus-glacial-lcd.modePicture' }));
    });
    expect(screen.getByRole('radio', { name: 'devices.asus-glacial-lcd.modePicture' })).toHaveAttribute('aria-checked', 'false');
  });

  it('panel mode checks its chip and shows no asset select or sub-controls', async () => {
    await mount({ ...base, mode: 'panel' });
    expect(screen.getByRole('radio', { name: 'devices.asus-glacial-lcd.modePanel' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryAllByTestId('sensor-picker')).toHaveLength(0);
    expect(screen.queryByText('devices.asus-glacial-lcd.picture')).toBeNull();
    expect(screen.queryByText('devices.asus-glacial-lcd.animation')).toBeNull();
    expect(screen.queryByText('devices.asus-glacial-lcd.widgetCount')).toBeNull();
  });

  it('clicking the panel chip sends mode panel and checks it at once', async () => {
    await mount({ ...base, modeChosen: false });
    mockGet.mockReturnValue(new Promise(() => {}));
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'devices.asus-glacial-lcd.modePanel' }));
    });
    expect(mockSet).toHaveBeenCalledWith({ mode: 'panel' });
    expect(screen.getByRole('radio', { name: 'devices.asus-glacial-lcd.modePanel' })).toHaveAttribute('aria-checked', 'true');
  });

  it('shows the sensor display name as the default label', async () => {
    await mount();
    expect(screen.getByRole('textbox', { name: 'devices.asus-glacial-lcd.widgetLabel:{"n":1}' })).toHaveValue('name-cpu-cpu-temp');
    expect(screen.getByRole('textbox', { name: 'devices.asus-glacial-lcd.widgetLabel:{"n":2}' })).toHaveValue('Fan');
  });

  it('typing a label sends it with all three slots', async () => {
    await mount();
    const box = screen.getByRole('textbox', { name: 'devices.asus-glacial-lcd.widgetLabel:{"n":1}' });
    await act(async () => {
      fireEvent.input(box, { target: { value: 'Core' } });
      fireEvent.blur(box);
    });
    expect(mockSet).toHaveBeenCalledWith({
      slots: [
        { category: 'cpu', sensor: 'cpu-temp', label: 'Core' },
        { category: '', sensor: '', label: 'Fan' },
        { category: '', sensor: '', label: '' },
      ],
    });
  });

  it('sends an empty label when the text is cleared or equals the default', async () => {
    await mount();
    const box = screen.getByRole('textbox', { name: 'devices.asus-glacial-lcd.widgetLabel:{"n":2}' });
    await act(async () => {
      fireEvent.input(box, { target: { value: '' } });
      fireEvent.blur(box);
    });
    expect(mockSet).toHaveBeenCalledWith({
      slots: [
        { category: 'cpu', sensor: 'cpu-temp', label: '' },
        { category: '', sensor: '', label: '' },
        { category: '', sensor: '', label: '' },
      ],
    });
  });

  it('caps a multibyte label at 17 UTF-8 bytes on a character boundary', async () => {
    await mount();
    const box = screen.getByRole('textbox', { name: 'devices.asus-glacial-lcd.widgetLabel:{"n":1}' });
    await act(async () => {
      fireEvent.input(box, { target: { value: '温度温度温度温度温度温度' } });
    });
    expect(box).toHaveValue('温度温度温');
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
