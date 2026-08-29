import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ManualRgbDevicesSection } from './ManualRgbDevicesSection';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    language: 'en',
  }),
}));

const api = vi.hoisted(() => ({
  fetchManualDevices: vi.fn(),
  addQmkDevice: vi.fn(),
  addE131Device: vi.fn(),
  removeManualDevice: vi.fn(),
  importOpenRgbConfig: vi.fn(),
}));
vi.mock('../../../api/lighting', () => api);

const empty = {
  qmk: [], e131: [],
  importSourcePath: 'C:\\Users\\x\\AppData\\Roaming\\OpenRGB\\OpenRGB.json',
  importSourceAvailable: true,
};

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.fetchManualDevices.mockResolvedValue(empty);
  api.addQmkDevice.mockResolvedValue({});
  api.addE131Device.mockResolvedValue({});
  api.removeManualDevice.mockResolvedValue({});
});

const vid = () => screen.getByLabelText('settings.manualRgb.qmk.vidPlaceholder');
const pid = () => screen.getByLabelText('settings.manualRgb.qmk.pidPlaceholder');
const addButtons = () => screen.getAllByText('settings.manualRgb.add').map(n => n.closest('button')!);

describe('ManualRgbDevicesSection', () => {
  it('lists the registrations the service reports', async () => {
    api.fetchManualDevices.mockResolvedValue({
      ...empty,
      qmk: [{ name: 'Keychron Q6 Pro', usbVid: '3434', usbPid: '0660' }],
      e131: [{ name: 'Desk', ip: '10.0.0.5', numLeds: 60, startUniverse: 1, startChannel: 1, keepaliveTime: 0, universeSize: 512 }],
    });

    render(<ManualRgbDevicesSection serviceOnline />);

    expect(await screen.findByText('Keychron Q6 Pro')).toBeTruthy();
    expect(screen.getByText('3434:0660')).toBeTruthy();
    expect(screen.getByText('Desk')).toBeTruthy();
  });

  /**
   * A malformed id reaches std::stoi in the daemon, which has no try/catch and
   * takes the whole process down, so the button must not offer to send one.
   */
  it('will not add a device whose ids are not hex', async () => {
    render(<ManualRgbDevicesSection serviceOnline />);
    await waitFor(() => expect(api.fetchManualDevices).toHaveBeenCalled());

    fireEvent.change(vid(), { target: { value: 'nope' } });
    fireEvent.change(pid(), { target: { value: '0660' } });
    expect(addButtons()[0].disabled).toBe(true);

    fireEvent.change(vid(), { target: { value: '3434' } });
    expect(addButtons()[0].disabled).toBe(false);
  });

  it('adds a QMK board and reloads the list', async () => {
    render(<ManualRgbDevicesSection serviceOnline />);
    await waitFor(() => expect(api.fetchManualDevices).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('settings.manualRgb.qmk.namePlaceholder'), { target: { value: 'Q6' } });
    fireEvent.change(vid(), { target: { value: '3434' } });
    fireEvent.change(pid(), { target: { value: '0660' } });
    fireEvent.click(addButtons()[0]);

    await waitFor(() => expect(api.addQmkDevice).toHaveBeenCalledWith('Q6', '3434', '0660'));
    await waitFor(() => expect(api.fetchManualDevices).toHaveBeenCalledTimes(2));
  });

  it('needs an address before an E1.31 device can be added', async () => {
    render(<ManualRgbDevicesSection serviceOnline />);
    await waitFor(() => expect(api.fetchManualDevices).toHaveBeenCalled());

    expect(addButtons()[1].disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('settings.manualRgb.e131.ipPlaceholder'), { target: { value: '10.0.0.5' } });
    expect(addButtons()[1].disabled).toBe(false);
  });

  it('reports how many devices an import brought in', async () => {
    api.importOpenRgbConfig.mockResolvedValue({ sourceFound: true, path: 'p', added: 2, qmkSeen: 1, e131Seen: 1 });

    render(<ManualRgbDevicesSection serviceOnline />);
    await waitFor(() => expect(api.fetchManualDevices).toHaveBeenCalled());
    fireEvent.click(screen.getByText('settings.manualRgb.import.action').closest('button')!);

    expect((await screen.findByRole('status')).textContent).toContain('importAdded');
  });

  it('says so when the import found nothing new', async () => {
    api.importOpenRgbConfig.mockResolvedValue({ sourceFound: true, path: 'p', added: 0, qmkSeen: 1, e131Seen: 0 });

    render(<ManualRgbDevicesSection serviceOnline />);
    await waitFor(() => expect(api.fetchManualDevices).toHaveBeenCalled());
    fireEvent.click(screen.getByText('settings.manualRgb.import.action').closest('button')!);

    expect((await screen.findByRole('status')).textContent).toContain('importNothingNew');
  });

  it('offers no import when this PC has no OpenRGB config', async () => {
    api.fetchManualDevices.mockResolvedValue({ ...empty, importSourceAvailable: false });

    render(<ManualRgbDevicesSection serviceOnline />);

    await waitFor(() => expect(api.fetchManualDevices).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.getByText('settings.manualRgb.import.action').closest('button')!.disabled).toBe(true);
    });
  });

  it('does not call the service while it is offline', () => {
    render(<ManualRgbDevicesSection serviceOnline={false} />);
    expect(api.fetchManualDevices).not.toHaveBeenCalled();
  });
});
