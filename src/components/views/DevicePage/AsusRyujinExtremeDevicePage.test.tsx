import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AsusRyujinExtremeDevicePage } from './AsusRyujinExtremeDevicePage';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockUpload = vi.fn();
const mockCanUpload = vi.fn();
const mockPush = vi.fn();

vi.mock('../../common/Toast/Toast', () => ({
  useToast: () => ({ push: mockPush }),
}));

vi.mock('../../../api/asus-ryujin-extreme', () => ({
  getRyujinDisplay: () => mockGet(),
  setRyujinDisplay: (patch: unknown) => mockSet(patch),
  uploadRyujinMedia: (file: File) => mockUpload(file),
  canUploadRyujinMedia: () => mockCanUpload(),
  RYUJIN_MIN_BRIGHTNESS: 10,
  RYUJIN_MAX_BRIGHTNESS: 100,
}));

const base = {
  isConnected: true,
  brightness: 60,
  rotation: 0,
  sensorCount: 3,
  slots: ['cpu-temp', 'gpu-temp', 'pump-rpm'],
  availableSensors: ['cpu-temp', 'gpu-temp', 'liquid-temp', 'pump-rpm', 'fan-rpm'],
  screenMode: 'monitor',
  mediaName: '',
  mediaHeld: false,
  uploadState: 'idle',
  uploadSent: 0,
  uploadTotal: 0,
  uploadMessage: '',
  uploadReason: '',
};

async function mount(state = base) {
  mockGet.mockResolvedValue(state);
  await act(async () => {
    render(<AsusRyujinExtremeDevicePage />);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSet.mockResolvedValue(true);
  mockUpload.mockResolvedValue({ ok: true, msg: '' });
  mockCanUpload.mockReturnValue(true);
});

describe('AsusRyujinExtremeDevicePage', () => {
  it('renders the stored brightness and rotation', async () => {
    await mount({ ...base, rotation: 90 });
    const slider = screen.getByRole('slider', { name: /brightnessAria/ });
    expect(slider).toHaveValue('60');
    expect(slider).toHaveAttribute('min', '10');
    expect(slider).toHaveAttribute('max', '100');
    expect(screen.getByRole('radio', { name: /rotationDegrees:\{"n":"90"\}/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /rotationDegrees:\{"n":"0"\}/ })).toHaveAttribute('aria-checked', 'false');
  });

  it('a brightness commit sends only the brightness', async () => {
    await mount();
    const slider = screen.getByRole('slider', { name: /brightnessAria/ });
    await act(async () => {
      fireEvent.change(slider, { target: { value: '35' } });
      fireEvent.pointerUp(slider);
    });
    // The slider defers its commit one tick after release.
    await waitFor(() => expect(mockSet).toHaveBeenCalled());
    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith({ brightness: 35 });
  });

  it('a rotation chip sends only the rotation and checks at once', async () => {
    await mount();
    mockGet.mockReturnValue(new Promise(() => {}));
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: /rotationDegrees:\{"n":"90"\}/ }));
    });
    expect(mockSet).toHaveBeenCalledWith({ rotation: 90 });
    expect(screen.getByRole('radio', { name: /rotationDegrees:\{"n":"90"\}/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('rolls the rotation back and toasts when the save is refused', async () => {
    await mount();
    mockSet.mockResolvedValue(false);
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: /rotationDegrees:\{"n":"90"\}/ }));
    });
    expect(mockPush).toHaveBeenCalledWith({
      title: 'devices.asus-ryujin-extreme.failedTitle',
      body: 'devices.asus-ryujin-extreme.failedBody',
    });
    expect(screen.getByRole('radio', { name: /rotationDegrees:\{"n":"0"\}/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('disables the controls while the device is not connected', async () => {
    await mount({ ...base, isConnected: false });
    expect(screen.getByRole('slider', { name: /brightnessAria/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /rotationDegrees:\{"n":"90"\}/ })).toBeDisabled();
  });

  it('skips a poll while a write is in flight', async () => {
    await mount();
    let release: (v: boolean) => void = () => {};
    mockSet.mockReturnValue(new Promise<boolean>(r => { release = r; }));
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: /rotationDegrees:\{"n":"90"\}/ }));
    });
    mockGet.mockClear();
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(mockGet).not.toHaveBeenCalled();
    mockGet.mockResolvedValue({ ...base, rotation: 90 });
    await act(async () => { release(true); });
  });

  it('ignores polls during a drag and keeps the knob, then re-reads after the commit', async () => {
    await mount();
    const slider = screen.getByRole('slider', { name: /brightnessAria/ });
    await act(async () => { fireEvent.change(slider, { target: { value: '35' } }); });
    mockGet.mockClear();
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(mockGet).not.toHaveBeenCalled();
    expect(slider).toHaveValue('35');
    await act(async () => { fireEvent.pointerUp(slider); });
    await waitFor(() => expect(mockSet).toHaveBeenCalledWith({ brightness: 35 }));
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
  });

  it('re-reads the stored brightness after a refused write', async () => {
    await mount();
    mockSet.mockResolvedValue(false);
    const slider = screen.getByRole('slider', { name: /brightnessAria/ });
    await act(async () => {
      fireEvent.change(slider, { target: { value: '35' } });
      fireEvent.pointerUp(slider);
    });
    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('slider', { name: /brightnessAria/ })).toHaveValue('60'));
  });

  it('shows one picker per visible reading', async () => {
    await mount();
    expect(screen.getAllByRole('button', { name: /devices\.asus-ryujin-extreme\.reading:/ })).toHaveLength(3);
    expect(screen.getByRole('radio', { name: '3' })).toHaveAttribute('aria-checked', 'true');
  });

  it('shows two pickers at a count of 2', async () => {
    await mount({ ...base, sensorCount: 2 });
    expect(screen.getAllByRole('button', { name: /devices\.asus-ryujin-extreme\.reading:/ })).toHaveLength(2);
    expect(screen.getByRole('radio', { name: '2' })).toHaveAttribute('aria-checked', 'true');
  });

  it('a readings chip sends only the sensor count', async () => {
    await mount();
    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: '2' })); });
    expect(mockSet).toHaveBeenCalledWith({ sensorCount: 2 });
    expect(mockSet).toHaveBeenCalledTimes(1);
  });

  it('picking a sensor sends all three slots with only that position changed', async () => {
    await mount();
    const pickers = screen.getAllByRole('button', { name: /devices\.asus-ryujin-extreme\.reading:/ });
    await act(async () => { fireEvent.click(pickers[1]); });
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'devices.asus-ryujin-extreme.sensor.liquidTemp' }));
    });
    expect(mockSet).toHaveBeenCalledWith({ slots: ['cpu-temp', 'liquid-temp', 'pump-rpm'] });
  });

  it('skips a poll while a sensor write is in flight', async () => {
    await mount();
    let release: (v: boolean) => void = () => {};
    mockSet.mockReturnValue(new Promise<boolean>(r => { release = r; }));
    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: '2' })); });
    mockGet.mockClear();
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(mockGet).not.toHaveBeenCalled();
    await act(async () => { release(true); });
  });
  it('switching to the hardware monitor sends only the screen mode', async () => {
    await mount({ ...base, screenMode: 'image', mediaName: 'a.gif', mediaHeld: true });
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'devices.asus-ryujin-extreme.screenModeMonitor' }));
    });
    await waitFor(() => expect(mockSet).toHaveBeenCalledWith({ screenMode: 'monitor' }));
  });

  it('image mode shows the picked file and hides the reading choices', async () => {
    await mount({ ...base, screenMode: 'image', mediaName: 'a.gif', mediaHeld: true });
    expect(screen.getByText(/mediaStored:\{"name":"a.gif"\}/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'devices.asus-ryujin-extreme.mediaReplace' })).toBeInTheDocument();
    expect(screen.queryByText('devices.asus-ryujin-extreme.readings')).not.toBeInTheDocument();
  });

  it('shows the upload progress while the cooler is being sent the file', async () => {
    await mount({ ...base, screenMode: 'image', mediaName: 'a.gif', uploadState: 'uploading', uploadSent: 5, uploadTotal: 20 });
    expect(screen.getByText(/mediaSending.*\(25%\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'devices.asus-ryujin-extreme.mediaReplace' })).toBeDisabled();
  });

  it('picking a file uploads it and refetches the state', async () => {
    await mount({ ...base, screenMode: 'image', mediaName: 'a.gif', mediaHeld: true });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'b.gif', { type: 'image/gif' });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    await waitFor(() => expect(mockUpload).toHaveBeenCalledWith(file));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('a refused upload raises the failure toast', async () => {
    mockUpload.mockResolvedValue({ ok: false, msg: 'File too large' });
    await mount({ ...base, screenMode: 'image', mediaName: 'a.gif' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['x'], 'b.gif')] } });
    });
    await waitFor(() => expect(mockPush).toHaveBeenCalled());
  });

  it('a refused upload shows the service message in the toast', async () => {
    mockUpload.mockResolvedValue({ ok: false, msg: 'File too large' });
    await mount({ ...base, screenMode: 'image', mediaName: 'a.gif' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['x'], 'b.gif')] } });
    });
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ body: 'File too large' })));
  });

  it('a failed upload shows the reason and not the waiting line', async () => {
    await mount({ ...base, screenMode: 'image', mediaName: 'a.gif', uploadState: 'failed', uploadMessage: 'no ack', uploadReason: 'failed' });
    expect(screen.getByText('devices.asus-ryujin-extreme.mediaFailed')).toBeInTheDocument();
    expect(screen.getByText(/mediaDetail:\{"msg":"no ack"\}/)).toBeInTheDocument();
    expect(screen.queryByText(/mediaWaiting/)).not.toBeInTheDocument();
  });

  it('the picker is disabled with an explanation on a remote tunnel', async () => {
    mockCanUpload.mockReturnValue(false);
    await mount({ ...base, screenMode: 'image', mediaName: 'a.gif', mediaHeld: true });
    expect(screen.getByRole('button', { name: 'devices.asus-ryujin-extreme.mediaReplace' })).toBeDisabled();
    expect(screen.getByText('devices.asus-ryujin-extreme.mediaRemote')).toBeInTheDocument();
  });

  it('a control-off abort says it resumes by itself and does not ask to choose the file again', async () => {
    await mount({ ...base, screenMode: 'image', mediaName: 'a.gif', uploadState: 'failed', uploadReason: 'controlOff' });
    expect(screen.getByText('devices.asus-ryujin-extreme.mediaReasonControlOff')).toBeInTheDocument();
    expect(screen.queryByText('devices.asus-ryujin-extreme.mediaFailed')).not.toBeInTheDocument();
  });

  it('choosing Image with nothing picked over the tunnel shows the remote note', async () => {
    mockCanUpload.mockReturnValue(false);
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'devices.asus-ryujin-extreme.screenModeImage' }));
    });
    expect(screen.getByText('devices.asus-ryujin-extreme.mediaRemote')).toBeInTheDocument();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('after a pick the controls stay locked until the service reports or the timeout passes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockGet.mockResolvedValue({ ...base, screenMode: 'image', mediaName: 'a.gif', mediaHeld: true, uploadState: 'done' });
      await act(async () => {
        render(<AsusRyujinExtremeDevicePage />);
      });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      // The service clears the earlier upload's state when it accepts a pick.
      mockGet.mockResolvedValue({ ...base, screenMode: 'image', mediaName: 'a.gif', uploadState: 'idle' });
      await act(async () => {
        fireEvent.change(input, { target: { files: [new File(['x'], 'a.gif')] } });
      });
      // Nothing new has been reported yet, so the picker stays locked.
      await waitFor(() => expect(screen.getByRole('button', { name: 'devices.asus-ryujin-extreme.mediaReplace' })).toBeDisabled());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(31000);
      });
      expect(screen.getByRole('button', { name: 'devices.asus-ryujin-extreme.mediaReplace' })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });
});
