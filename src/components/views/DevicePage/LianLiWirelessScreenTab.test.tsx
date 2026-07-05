import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LianLiWirelessScreenTab } from './LianLiWirelessScreenTab';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
  }),
}));

const mockGetScreens = vi.fn();
const mockGetMedia = vi.fn();
const mockSetSettings = vi.fn();
const mockSetContent = vi.fn();
const mockImportMedia = vi.fn();
const mockDeleteMedia = vi.fn();

vi.mock('../../../api/lianli-wireless', () => ({
  getLianLiWirelessScreens: (...args: any[]) => mockGetScreens(...args),
  getLianLiWirelessMedia: (...args: any[]) => mockGetMedia(...args),
  setLianLiWirelessScreenSettings: (...args: any[]) => mockSetSettings(...args),
  setLianLiWirelessScreenContent: (...args: any[]) => mockSetContent(...args),
  importLianLiWirelessMedia: (...args: any[]) => mockImportMedia(...args),
  deleteLianLiWirelessMedia: (...args: any[]) => mockDeleteMedia(...args),
}));

// Positions are all 0 on real hardware (GetPosIndex is unresolved), so the
// tiles must number by list order; this fixture pins that, not s.position.
const screensData = [
  { serial: 'S1', position: 0, width: 400, height: 400, brightness: 80, rotation: 0, contentType: 'image', mediaId: 'm1' },
  { serial: 'S2', position: 0, width: 400, height: 400, brightness: 50, rotation: 1, contentType: 'off' },
  { serial: 'S3', position: 0, width: 400, height: 400, brightness: 60, rotation: 0, contentType: 'sensor' },
];

const mediaData = [
  { id: 'm1', name: 'Wallpaper', kind: 'image' },
  { id: 'm3', name: 'Poster', kind: 'image' },
  { id: 'm2', name: 'Loop', kind: 'gif' },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetScreens.mockResolvedValue(screensData);
  mockGetMedia.mockResolvedValue(mediaData);
  mockSetSettings.mockResolvedValue(true);
  mockSetContent.mockResolvedValue(true);
  mockImportMedia.mockResolvedValue({ id: 'm4', name: 'test.png', kind: 'image' });
  mockDeleteMedia.mockResolvedValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function renderTab() {
  await act(async () => {
    render(<LianLiWirelessScreenTab />);
  });
}

function fanTile(n: number) {
  return screen.getByRole('button', { name: `devices.lianli-wireless.fanN:{"n":${n}}` });
}

// Selection is multi-toggle; deselect the default (Fan 1) and select fan n so
// only it is targeted.
function selectOnly(n: number) {
  fireEvent.click(fanTile(1));
  fireEvent.click(fanTile(n));
}

describe('LianLiWirelessScreenTab', () => {
  it('renders a tile per screen, first selected by default, with no group-all tile', async () => {
    await renderTab();

    expect(fanTile(1)).toHaveAttribute('aria-pressed', 'true');
    expect(fanTile(2)).toHaveAttribute('aria-pressed', 'false');
    expect(fanTile(3)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'devices.lianli-wireless.screenGroupAll' })).not.toBeInTheDocument();

    // Defaults to screen 1 (image content type).
    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.contentTypeAria' }))
      .toHaveTextContent('devices.lianli-wireless.contentTypePicture');
  });

  it('selects one fan at a time in single mode (the default)', async () => {
    await renderTab();

    expect(fanTile(1)).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(fanTile(2));
    expect(fanTile(2)).toHaveAttribute('aria-pressed', 'true');
    expect(fanTile(1)).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles a fan in and out of the selection in multiple mode', async () => {
    await renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.selectionModeMultiple' }));

    expect(fanTile(2)).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(fanTile(2));
    expect(fanTile(2)).toHaveAttribute('aria-pressed', 'true');
    // Fan 1 (the default) is still selected: multiple mode groups them.
    expect(fanTile(1)).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(fanTile(2));
    expect(fanTile(2)).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows a loading note before the screens list resolves', async () => {
    let resolvePromise: (v: typeof screensData) => void = () => {};
    mockGetScreens.mockReturnValue(new Promise(resolve => { resolvePromise = resolve; }));

    render(<LianLiWirelessScreenTab />);
    expect(screen.getByText('devices.lianli-wireless.loadingScreens')).toBeInTheDocument();

    await act(async () => {
      resolvePromise(screensData);
    });
    expect(screen.queryByText('devices.lianli-wireless.loadingScreens')).not.toBeInTheDocument();
  });

  it('shows an empty note when connected but no screens are reported', async () => {
    mockGetScreens.mockResolvedValue([]);
    await renderTab();
    expect(screen.getByText('devices.lianli-wireless.noScreens')).toBeInTheDocument();
  });

  it('selecting only a different fan shows its content type', async () => {
    await renderTab();

    selectOnly(2);

    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.contentTypeAria' }))
      .toHaveTextContent('devices.lianli-wireless.contentTypeOff');
  });

  it('changing the content type calls the API for the selected screen only', async () => {
    await renderTab();

    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.contentTypeAria' }));
    fireEvent.click(screen.getByRole('option', { name: 'devices.lianli-wireless.contentTypeSensor' }));

    expect(mockSetContent).toHaveBeenCalledTimes(1);
    expect(mockSetContent).toHaveBeenCalledWith('S1', 'sensor');
  });

  describe('sensor panel', () => {
    async function renderOnSensorScreen() {
      await renderTab();
      selectOnly(3);
    }

    it('shows the source and style defaults and posts a change to the source', async () => {
      await renderOnSensorScreen();

      expect(screen.getByRole('button', { name: 'devices.lianli-wireless.sensorSourceLabel' }))
        .toHaveTextContent('devices.lianli-wireless.sensorSourceCpuTemp');
      expect(screen.getByRole('button', { name: 'devices.lianli-wireless.sensorStyleRing' }))
        .toHaveAttribute('aria-pressed', 'true');

      fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.sensorSourceLabel' }));
      fireEvent.click(screen.getByRole('option', { name: 'devices.lianli-wireless.sensorSourceGpuTemp' }));

      expect(mockSetContent).toHaveBeenCalledWith('S3', 'sensor', undefined, { sensorSource: 'gpuTemp' });
    });

    it('posts a change to the source for memory usage', async () => {
      await renderOnSensorScreen();

      fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.sensorSourceLabel' }));
      fireEvent.click(screen.getByRole('option', { name: 'devices.lianli-wireless.sensorSourceMemoryUsage' }));

      expect(mockSetContent).toHaveBeenCalledWith('S3', 'sensor', undefined, { sensorSource: 'memoryUsage' });
    });

    it('posts a change to the gauge style', async () => {
      await renderOnSensorScreen();

      fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.sensorStyleBar' }));

      expect(mockSetContent).toHaveBeenCalledWith('S3', 'sensor', undefined, { sensorStyle: 'bar' });
    });

    it('shows the temperature unit toggle for a temperature source and posts a change', async () => {
      await renderOnSensorScreen();

      fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.tempUnitFahrenheit' }));

      expect(mockSetContent).toHaveBeenCalledWith('S3', 'sensor', undefined, { tempUnit: 'f' });
    });

    it('hides the temperature unit toggle for a non-temperature source', async () => {
      await renderOnSensorScreen();

      fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.sensorSourceLabel' }));
      fireEvent.click(screen.getByRole('option', { name: 'devices.lianli-wireless.sensorSourceFanRpm' }));

      expect(screen.queryByRole('button', { name: 'devices.lianli-wireless.tempUnitLabel' })).not.toBeInTheDocument();
    });

    it('commits the accent color from the hex input', async () => {
      await renderOnSensorScreen();

      const [accentHex] = screen.getAllByLabelText('common.hexColor');
      fireEvent.change(accentHex, { target: { value: '#123456' } });

      expect(mockSetContent).toHaveBeenCalledWith('S3', 'sensor', undefined, { colorA: '#123456' });
    });
  });

  describe('clock panel', () => {
    async function renderOnClockScreen() {
      await renderTab();
      selectOnly(3);
      fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.contentTypeAria' }));
      fireEvent.click(screen.getByRole('option', { name: 'devices.lianli-wireless.contentTypeClock' }));
    }

    it('shows the default clock face and posts a change', async () => {
      await renderOnClockScreen();

      expect(screen.getByRole('button', { name: 'devices.lianli-wireless.clockFaceDigital' }))
        .toHaveAttribute('aria-pressed', 'true');

      fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.clockFaceAnalogClassic' }));

      expect(mockSetContent).toHaveBeenCalledWith('S3', 'clock', undefined, { clockFace: 'analogClassic' });
    });

    it('commits the secondary color from the hex input', async () => {
      await renderOnClockScreen();

      const [, secondaryHex] = screen.getAllByLabelText('common.hexColor');
      fireEvent.change(secondaryHex, { target: { value: '#abcdef' } });

      expect(mockSetContent).toHaveBeenCalledWith('S3', 'clock', undefined, { colorB: '#abcdef' });
    });
  });

  describe('animation panel', () => {
    async function renderOnAnimationScreen() {
      await renderTab();
      selectOnly(3);
      fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.contentTypeAria' }));
      fireEvent.click(screen.getByRole('option', { name: 'devices.lianli-wireless.contentTypeAnimation' }));
    }

    it('shows the default animation and posts a change', async () => {
      await renderOnAnimationScreen();

      expect(screen.getByRole('button', { name: 'devices.lianli-wireless.animationPulse' }))
        .toHaveAttribute('aria-pressed', 'true');

      fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.animationSpin' }));

      expect(mockSetContent).toHaveBeenCalledWith('S3', 'animation', undefined, { animationId: 'spin' });
    });

    it('shows the default accent and secondary colors matching the service render defaults', async () => {
      await renderOnAnimationScreen();

      const [accentHex, secondaryHex] = screen.getAllByLabelText('common.hexColor') as HTMLInputElement[];
      expect(accentHex.value).toBe('#00D1FF');
      expect(secondaryHex.value).toBe('#9B5DE5');
    });

    it('hides the color pickers for the spectrum animation', async () => {
      await renderOnAnimationScreen();

      expect(screen.getAllByLabelText('common.hexColor').length).toBe(2);
      fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.animationSpectrum' }));
      expect(screen.queryByLabelText('common.hexColor')).not.toBeInTheDocument();
    });
  });

  it('selecting several fans broadcasts a brightness commit to every selected screen', async () => {
    await renderTab();

    // Switch to multiple mode, then add Fan 2 and Fan 3 to Fan 1's selection.
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.selectionModeMultiple' }));
    fireEvent.click(fanTile(2));
    fireEvent.click(fanTile(3));

    const slider = screen.getByRole('slider', { name: 'devices.lianli-wireless.brightness' }) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '30' } });
    fireEvent.pointerUp(slider);

    await waitFor(() => expect(mockSetSettings).toHaveBeenCalledTimes(3));
    expect(mockSetSettings).toHaveBeenCalledWith('S1', { brightness: 30 });
    expect(mockSetSettings).toHaveBeenCalledWith('S2', { brightness: 30 });
    expect(mockSetSettings).toHaveBeenCalledWith('S3', { brightness: 30 });
  });

  it('shows a mixed state and hides content panels when selected fans differ', async () => {
    await renderTab();
    // Fan 1 is image, Fan 2 is off; select both in multiple mode.
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.selectionModeMultiple' }));
    fireEvent.click(fanTile(2));

    expect(screen.getByText('devices.lianli-wireless.contentMixedHint')).toBeInTheDocument();
    // Fan 1's image media panel is not shown while the selection is mixed.
    expect(screen.queryByRole('button', { name: 'Wallpaper' })).not.toBeInTheDocument();

    // Picking a type applies it to every selected fan.
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.contentTypeAria' }));
    fireEvent.click(screen.getByRole('option', { name: 'devices.lianli-wireless.contentTypeClock' }));
    expect(mockSetContent).toHaveBeenCalledWith('S1', 'clock');
    expect(mockSetContent).toHaveBeenCalledWith('S2', 'clock');
  });

  it('changing the rotation chip commits the new rotation for the selected screen', async () => {
    await renderTab();

    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.rotationDegrees:{"n":180}' }));

    expect(mockSetSettings).toHaveBeenCalledWith('S1', { rotation: 2 });
  });

  it('lists the media library filtered to the active content type and highlights the current pick', async () => {
    await renderTab();

    const wallpaper = screen.getByRole('button', { name: 'Wallpaper' });
    const poster = screen.getByRole('button', { name: 'Poster' });
    expect(wallpaper).toHaveAttribute('aria-pressed', 'true');
    expect(poster).toHaveAttribute('aria-pressed', 'false');
    // The gif-kind item is not shown while the picture content type is active.
    expect(screen.queryByRole('button', { name: 'Loop' })).not.toBeInTheDocument();

    fireEvent.click(poster);
    expect(mockSetContent).toHaveBeenCalledWith('S1', 'image', 'm3');
  });

  it('deletes media after confirming', async () => {
    await renderTab();

    const poster = screen.getByRole('button', { name: 'Poster' });
    fireEvent.click(within(poster).getByRole('button', { name: 'devices.lianli-wireless.deleteMediaAria' }));

    const dialog = screen.getByRole('alertdialog', { name: 'devices.lianli-wireless.deleteMediaTitle' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(mockDeleteMedia).toHaveBeenCalledWith('m3'));
  });

  it('uploads a new image through the crop dialog', async () => {
    await renderTab();

    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.uploadImage' }));
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toHaveAttribute('accept', 'image/jpeg,image/png');

    const file = new File(['data'], 'test.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    const dialog = screen.getByRole('dialog', { name: 'cropper.title' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'cropper.confirm' }));

    await waitFor(() => expect(mockImportMedia).toHaveBeenCalledTimes(1));
    expect(mockImportMedia).toHaveBeenCalledWith(file, { x: 0, y: 0, w: 1, h: 1 });
    await waitFor(() => expect(mockGetMedia).toHaveBeenCalledTimes(2));
  });
});
