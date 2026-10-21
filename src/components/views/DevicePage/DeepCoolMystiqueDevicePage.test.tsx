import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepCoolMystiqueDevicePage } from './DeepCoolMystiqueDevicePage';
import pageSource from './DeepCoolMystiqueDevicePage.tsx?raw';
import en from '../../../locales/en.json';

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

vi.mock('../../../api/deepcool-mystique', () => ({
  getMystiqueState: () => mockGet(),
  setMystiqueSettings: (patch: unknown) => mockSet(patch),
}));

vi.mock('../../../panel/widgets/monitoring/picker/SensorPicker', () => ({
  useSensorLookup: () => ({ resolve: () => undefined }),
  SensorPicker: ({ category, sensor, onChange }: { category: string; sensor: string; onChange: (s: { category: string; sensor: string }) => void }) => (
    <button type="button" data-testid="sensor-picker" onClick={() => onChange({ category: 'motherboard', sensor: 'fan/chassis' })}>
      {category}/{sensor}
    </button>
  ),
}));

const base = {
  isConnected: true,
  modeChosen: true,
  readoutChosen: true,
  recordingChosen: true,
  deviceChosen: true,
  mode: 'monitor',
  readout: 'temperature',
  recordFrequency: true,
  recordTemperature: false,
  brightness: 70,
  gyroscope: true,
  rgbSync: false,
  cpuFan: { category: '', sensor: '', resolvedCategory: 'motherboard', resolvedSensor: 'fan/cpu' },
  pump: { category: '', sensor: '', resolvedCategory: 'motherboard', resolvedSensor: 'fan/opt' },
};

async function mount(state = base) {
  mockGet.mockResolvedValue(state);
  await act(async () => {
    render(<DeepCoolMystiqueDevicePage />);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSet.mockResolvedValue(true);
});

describe('DeepCoolMystiqueDevicePage', () => {
  it('monitor mode shows the main readout select and no recording toggles', async () => {
    await mount();
    expect(screen.getByText('devices.deepcool-mystique.readout')).toBeTruthy();
    expect(screen.queryByText('devices.deepcool-mystique.recordFrequency')).toBeNull();
  });

  it('recording mode shows the two graph toggles and no readout select', async () => {
    await mount({ ...base, mode: 'recording' });
    expect(screen.getByText('devices.deepcool-mystique.recordFrequency')).toBeTruthy();
    expect(screen.getByText('devices.deepcool-mystique.recordTemperature')).toBeTruthy();
    expect(screen.queryByText('devices.deepcool-mystique.readout')).toBeNull();
  });

  it('shows no mode controls until a mode has been chosen from Nexus', async () => {
    await mount({ ...base, modeChosen: false });
    expect(screen.queryByText('devices.deepcool-mystique.readout')).toBeNull();
    expect(screen.queryByText('devices.deepcool-mystique.recordFrequency')).toBeNull();
  });

  it('choosing a mode sends it at once', async () => {
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'devices.deepcool-mystique.modeMedia' }));
    });
    expect(mockSet).toHaveBeenCalledWith({ mode: 'media' });
  });

  it('the rgb sync toggle sends its value at once', async () => {
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'devices.deepcool-mystique.rgbSync' }));
    });
    expect(mockSet).toHaveBeenCalledWith({ rgbSync: true });
  });

  it('picking a fan sensor sends the pick', async () => {
    await mount();
    await act(async () => {
      fireEvent.click(screen.getAllByTestId('sensor-picker')[0]);
    });
    expect(mockSet).toHaveBeenCalledWith({ cpuFan: { category: 'motherboard', sensor: 'fan/chassis' } });
  });

  it('a refused write raises a toast', async () => {
    mockSet.mockResolvedValue(false);
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'devices.deepcool-mystique.gyroscope' }));
    });
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ title: 'devices.deepcool-mystique.failedTitle' }));
  });

  it('controls stay disabled while the screen is not connected', async () => {
    await mount({ ...base, isConnected: false });
    expect((screen.getByRole('switch', { name: 'devices.deepcool-mystique.gyroscope' }) as HTMLInputElement).disabled
      || screen.getByRole('switch', { name: 'devices.deepcool-mystique.gyroscope' }).getAttribute('aria-disabled') === 'true').toBe(true);
  });

  it('every translation key the page uses exists in the English locale', () => {
    const used = new Set(pageSource.match(/devices\.deepcool-mystique\.[A-Za-z]+/g) ?? []);
    const locale = en as Record<string, string>;
    expect(used.size).toBeGreaterThan(10);
    expect([...used].filter(k => !(k in locale))).toEqual([]);
  });

  it('a poll that started before a write and resolves after it does not undo the write', async () => {
    vi.useFakeTimers();
    try {
      let resolveStale: (v: unknown) => void = () => {};
      mockGet.mockResolvedValueOnce(base);
      await act(async () => {
        render(<DeepCoolMystiqueDevicePage />);
      });
      mockGet.mockReturnValueOnce(new Promise(r => { resolveStale = r; }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3100);
      });
      mockGet.mockResolvedValue({ ...base, rgbSync: true });
      await act(async () => {
        fireEvent.click(screen.getByRole('switch', { name: 'devices.deepcool-mystique.rgbSync' }));
      });
      await act(async () => {
        resolveStale(base);
      });
      expect(screen.getByRole('switch', { name: 'devices.deepcool-mystique.rgbSync' })).toHaveAttribute('aria-checked', 'true');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a picked fan sensor can be returned to the automatic choice', async () => {
    await mount({ ...base, cpuFan: { category: 'motherboard', sensor: 'fan/chassis', resolvedCategory: 'motherboard', resolvedSensor: 'fan/chassis' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'devices.deepcool-mystique.automatic' }));
    });
    expect(mockSet).toHaveBeenCalledWith({ cpuFan: { category: '', sensor: '' } });
  });

  it('offers no automatic button while a readout is already automatic', async () => {
    await mount();
    expect(screen.queryByRole('button', { name: 'devices.deepcool-mystique.automatic' })).toBeNull();
  });

  it('marks the readout, recording and system groups as not set until the user changes them', async () => {
    await mount({ ...base, readoutChosen: false, recordingChosen: false, deviceChosen: false });
    expect(screen.getByText('devices.deepcool-mystique.deviceUnsetHint')).toBeTruthy();
    expect(screen.getAllByText('devices.deepcool-mystique.notSet').length).toBeGreaterThan(0);
  });

  it('shows no unset note once the system group has been chosen', async () => {
    await mount();
    expect(screen.queryByText('devices.deepcool-mystique.deviceUnsetHint')).toBeNull();
  });

  it('recording mode notes that the toggles are not set yet', async () => {
    await mount({ ...base, mode: 'recording', recordingChosen: false });
    expect(screen.getByText('devices.deepcool-mystique.recordingUnsetHint')).toBeTruthy();
  });
});
