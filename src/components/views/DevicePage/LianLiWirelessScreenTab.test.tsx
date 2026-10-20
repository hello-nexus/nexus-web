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
const mockSetOrder = vi.fn();
const mockGetAioScreen = vi.fn(() => Promise.resolve({
  brightness: 80, theme: 0, themeCount: 13, labelColor: '#FFFFFF', valueColor: '#FFFFFF', unitColor: '#FFFFFF',
  showCpuTemp: true, showCpuLoad: true, showGpuTemp: true, showGpuLoad: true, showFanSpeed: false, nexusWidgets: true,
}));

const mockSearchKlipy = vi.fn();
const mockStageKlipy = vi.fn();
const mockFetchStaged = vi.fn();

vi.mock('../../../api/klipy', () => ({
  searchKlipy: (...args: any[]) => mockSearchKlipy(...args),
  stageKlipy: (...args: any[]) => mockStageKlipy(...args),
  klipyThumbUrl: (slug: string) => `thumb/${slug}`,
}));

vi.mock('../../../api/mediaLibrary', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/mediaLibrary')>()),
  fetchStagedFile: (...args: any[]) => mockFetchStaged(...args),
  cancelMediaStage: () => Promise.resolve(),
}));

vi.mock('../../../api/lianli-wireless', () => ({
  getLianLiWirelessScreens: (...args: any[]) => mockGetScreens(...args),
  getLianLiWirelessMedia: (...args: any[]) => mockGetMedia(...args),
  setLianLiWirelessScreenSettings: (...args: any[]) => mockSetSettings(...args),
  setLianLiWirelessScreenContent: (...args: any[]) => mockSetContent(...args),
  importLianLiWirelessMedia: (...args: any[]) => mockImportMedia(...args),
  deleteLianLiWirelessMedia: (...args: any[]) => mockDeleteMedia(...args),
  setLianLiWirelessScreenOrder: (...args: any[]) => mockSetOrder(...args),
  getLianLiAioScreen: (...args: any[]) => mockGetAioScreen(...args),
  setLianLiAioScreen: () => Promise.resolve(true),
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
  mockSetOrder.mockResolvedValue(true);
  mockSearchKlipy.mockResolvedValue({ items: [{ slug: 'cat', title: 'Cat', width: 400, height: 400 }], hasNext: false });
  mockStageKlipy.mockResolvedValue({ stageId: 'st1', mediaKind: 'gif', error: false, msg: '' });
  mockFetchStaged.mockResolvedValue(new File(['x'], 'cat.gif', { type: 'image/gif' }));
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
      .toHaveTextContent('devices.lianli-wireless.contentTypeMedia');
  });

  it('moves the selected fan right, renumbers the tiles, and persists the serial order', async () => {
    await renderTab();
    const group = screen.getByRole('group', { name: 'devices.lianli-wireless.screensAria' });
    const before = within(group).getAllByRole('button', { pressed: true });
    expect(before).toHaveLength(1);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.orderMoveRight' }));
    });

    expect(mockSetOrder).toHaveBeenCalledWith(['S2', 'S1', 'S3']);
    // The moved fan (S1) is now the second tile and still the selected one.
    const tiles = within(group).getAllByRole('button');
    expect(tiles[1]).toHaveAttribute('aria-pressed', 'true');
    expect(tiles[0]).toHaveAttribute('aria-pressed', 'false');
  });

  it('disables the order buttons at the ends of the list and when several fans are selected', async () => {
    await renderTab();
    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.orderMoveLeft' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.orderMoveRight' })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: 'devices.lianli-wireless.selectionModeMultiple' }));
    const group = screen.getByRole('group', { name: 'devices.lianli-wireless.screensAria' });
    fireEvent.click(within(group).getAllByRole('button')[1]);
    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.orderMoveRight' })).toBeDisabled();
    expect(mockSetOrder).not.toHaveBeenCalled();
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
    fireEvent.click(screen.getByRole('radio', { name: 'devices.lianli-wireless.selectionModeMultiple' }));

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

  it('a bound HydroShift II with no fan screens fills the tab with its own screen', async () => {
    mockGetScreens.mockResolvedValue([]);
    await act(async () => {
      render(<LianLiWirelessScreenTab aioMacs={['5ED6D8E566E1']} />);
    });
    expect(screen.getByText('devices.lianli-wireless.aioScreen.title')).toBeInTheDocument();
    expect(screen.queryByText('devices.lianli-wireless.noScreens')).not.toBeInTheDocument();
    expect(screen.queryByText('devices.lianli-wireless.displaySection')).not.toBeInTheDocument();
  });

  it('marks a bound HydroShift II on USB and offers its screen page', async () => {
    mockGetScreens.mockResolvedValue([]);
    const open = vi.fn();
    await act(async () => {
      render(<LianLiWirelessScreenTab aioMacs={['5ED6D8E566E1']} usbMacs={['5ED6D8E566E1']} panelOpener={() => open} />);
    });
    expect(screen.getByText('devices.lianli-wireless.aioScreen.widgetsUsb')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.managePanel' }));
    expect(open).toHaveBeenCalled();
  });

  it('a bound HydroShift II sits above the fan screens', async () => {
    await act(async () => {
      render(<LianLiWirelessScreenTab aioMacs={['5ED6D8E566E1']} />);
    });
    const aio = screen.getByText('devices.lianli-wireless.aioScreen.title');
    const display = screen.getByText('devices.lianli-wireless.displaySection');
    expect(aio.compareDocumentPosition(display) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the HydroShift II section survives the screens list loading', async () => {
    let resolveScreens: (v: unknown) => void = () => {};
    mockGetScreens.mockReturnValue(new Promise(resolve => { resolveScreens = resolve; }));
    await act(async () => {
      render(<LianLiWirelessScreenTab aioMacs={['5ED6D8E566E1']} />);
    });
    expect(screen.getByText('devices.lianli-wireless.loadingScreens')).toBeInTheDocument();

    await act(async () => {
      resolveScreens([]);
    });
    expect(screen.getByText('devices.lianli-wireless.aioScreen.title')).toBeInTheDocument();
    expect(screen.queryByText('devices.lianli-wireless.selectionSection')).not.toBeInTheDocument();
    expect(mockGetAioScreen).toHaveBeenCalledTimes(1);
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
      expect(screen.getByRole('radio', { name: 'devices.lianli-wireless.sensorStyleRing' }))
        .toHaveAttribute('aria-checked', 'true');

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

    it('posts a change to the source for VRAM usage', async () => {
      await renderOnSensorScreen();

      fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.sensorSourceLabel' }));
      fireEvent.click(screen.getByRole('option', { name: 'devices.lianli-wireless.sensorSourceVramUsage' }));

      expect(mockSetContent).toHaveBeenCalledWith('S3', 'sensor', undefined, { sensorSource: 'vramUsage' });
    });

    it('posts a change to the gauge style', async () => {
      await renderOnSensorScreen();

      fireEvent.click(screen.getByRole('radio', { name: 'devices.lianli-wireless.sensorStyleBar' }));

      expect(mockSetContent).toHaveBeenCalledWith('S3', 'sensor', undefined, { sensorStyle: 'bar' });
    });

    it('shows the temperature unit toggle for a temperature source and posts a change', async () => {
      await renderOnSensorScreen();

      fireEvent.click(screen.getByRole('radio', { name: 'devices.lianli-wireless.tempUnitFahrenheit' }));

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

      expect(screen.getByRole('radio', { name: 'devices.lianli-wireless.clockFaceDigital' }))
        .toHaveAttribute('aria-checked', 'true');

      fireEvent.click(screen.getByRole('radio', { name: 'devices.lianli-wireless.clockFaceAnalogClassic' }));

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

      expect(screen.getByRole('radio', { name: 'devices.lianli-wireless.animationPulse' }))
        .toHaveAttribute('aria-checked', 'true');

      fireEvent.click(screen.getByRole('radio', { name: 'devices.lianli-wireless.animationSpin' }));

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
      fireEvent.click(screen.getByRole('radio', { name: 'devices.lianli-wireless.animationSpectrum' }));
      expect(screen.queryByLabelText('common.hexColor')).not.toBeInTheDocument();
    });
  });

  it('selecting several fans broadcasts a brightness commit to every selected screen', async () => {
    await renderTab();

    // Switch to multiple mode, then add Fan 2 and Fan 3 to Fan 1's selection.
    fireEvent.click(screen.getByRole('radio', { name: 'devices.lianli-wireless.selectionModeMultiple' }));
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
    fireEvent.click(screen.getByRole('radio', { name: 'devices.lianli-wireless.selectionModeMultiple' }));
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

    fireEvent.click(screen.getByRole('radio', { name: 'devices.lianli-wireless.rotationDegrees:{"n":180}' }));

    expect(mockSetSettings).toHaveBeenCalledWith('S1', { rotation: 2 });
  });

  it('lists the whole media library and highlights the current pick', async () => {
    await renderTab();

    const wallpaper = screen.getByRole('button', { name: 'Wallpaper' });
    const poster = screen.getByRole('button', { name: 'Poster' });
    expect(wallpaper).toHaveAttribute('aria-pressed', 'true');
    expect(poster).toHaveAttribute('aria-pressed', 'false');
    // Pictures and GIFs share one gallery.
    expect(screen.getByRole('button', { name: 'Loop' })).toBeInTheDocument();

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

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toHaveAttribute('accept', 'image/jpeg,image/png,image/gif,video/mp4');
    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.uploadMedia' })).toBeInTheDocument();

    const file = new File(['data'], 'test.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    const dialog = screen.getByRole('dialog', { name: 'cropper.title' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'cropper.confirm' }));

    await waitFor(() => expect(mockImportMedia).toHaveBeenCalledTimes(1));
    expect(mockImportMedia).toHaveBeenCalledWith(file, { x: 0, y: 0, w: 1, h: 1, rotate: 0, mirror: false });
    await waitFor(() => expect(mockGetMedia).toHaveBeenCalledTimes(2));
  });

  const panelScreen = (over: Record<string, unknown> = {}) => ({
    serial: 'S1', position: 0, width: 400, height: 400, brightness: 80, rotation: 0, contentType: 'image', mediaId: 'm1', ...over,
  });
  const panelSwitch = () => screen.getByRole('switch', { name: 'devices.lianli-wireless.nexusPanelUse' });

  it('turns the Nexus panel on through the settings endpoint and locks the content controls', async () => {
    await renderTab();
    expect(panelSwitch()).toHaveAttribute('aria-checked', 'false');
    await act(async () => { fireEvent.click(panelSwitch()); });

    expect(mockSetSettings).toHaveBeenCalledWith('S1', { nexusPanel: true });
    expect(panelSwitch()).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.contentTypeAria' })).toBeDisabled();
  });

  it('shows Open panel while the panel is on and its record exists', async () => {
    const onOpen = vi.fn();
    mockGetScreens.mockResolvedValue([panelScreen({ nexusPanel: true, panelDeviceId: 'rec-1' })]);
    await act(async () => { render(<LianLiWirelessScreenTab onOpenScreenPanel={onOpen} />); });

    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.openPanel' }));
    expect(onOpen).toHaveBeenCalledWith('rec-1');
  });

  it('disables Open panel while the panel record is not published yet', async () => {
    mockGetScreens.mockResolvedValue([panelScreen({ nexusPanel: true, panelDeviceId: null })]);
    await act(async () => { render(<LianLiWirelessScreenTab onOpenScreenPanel={vi.fn()} />); });

    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.openPanel' })).toBeDisabled();
    expect(screen.getByText('devices.lianli-wireless.panelPending')).toBeInTheDocument();
  });

  it('shows no Open panel action while the panel is off', async () => {
    await renderTab();
    expect(screen.queryByRole('button', { name: 'devices.lianli-wireless.openPanel' })).not.toBeInTheDocument();
  });

  describe('mixed values across several selected screens', () => {
    async function renderTwo(a: Record<string, unknown>, b: Record<string, unknown>) {
      mockGetScreens.mockResolvedValue([panelScreen(a), panelScreen({ serial: 'S2', ...b })]);
      await renderTab();
      fireEvent.click(screen.getByRole('radio', { name: 'devices.lianli-wireless.selectionModeMultiple' }));
      fireEvent.click(fanTile(2));
    }

    it('renders brightness mixed and one drag posts to both screens', async () => {
      await renderTwo({ brightness: 40 }, { brightness: 80 });
      const slider = screen.getByRole('slider', { name: 'devices.lianli-wireless.brightness' });
      expect(slider).toHaveAttribute('data-mixed', 'true');
      expect(slider).toHaveAttribute('aria-valuetext', 'common.mixed');

      await act(async () => { fireEvent.change(slider, { target: { value: '60' } }); });
      await act(async () => { fireEvent.pointerUp(slider); });
      await waitFor(() => expect(mockSetSettings).toHaveBeenCalledTimes(2));
      expect(mockSetSettings).toHaveBeenCalledWith('S1', { brightness: 60 });
      expect(mockSetSettings).toHaveBeenCalledWith('S2', { brightness: 60 });
    });

    it('leaves mixed brightness alone on an empty edit, and a typed value sets every screen', async () => {
      await renderTwo({ brightness: 40 }, { brightness: 80 });
      const mixedValue = () => screen.getAllByText('common.mixed')
        .find(el => el.getAttribute('role') === 'button') as HTMLElement;

      await act(async () => { fireEvent.click(mixedValue()); });
      await act(async () => { fireEvent.blur(screen.getByRole('spinbutton')); });
      expect(mockSetSettings).not.toHaveBeenCalled();

      await act(async () => { fireEvent.click(mixedValue()); });
      const input = screen.getByRole('spinbutton');
      await act(async () => {
        fireEvent.change(input, { target: { value: '30' } });
        fireEvent.keyDown(input, { key: 'Enter' });
      });
      expect(mockSetSettings).toHaveBeenCalledWith('S1', { brightness: 30 });
      expect(mockSetSettings).toHaveBeenCalledWith('S2', { brightness: 30 });
    });

    it('renders rotation chips 0 and 2 partial with none active', async () => {
      await renderTwo({ rotation: 0 }, { rotation: 2 });
      const group = screen.getByRole('radiogroup', { name: 'devices.lianli-wireless.rotationLabel' });
      const chips = within(group).getAllByRole('radio');
      expect(chips.filter(c => c.getAttribute('aria-checked') === 'true')).toHaveLength(0);
      expect(chips.filter(c => c.getAttribute('data-partial') === 'true')).toHaveLength(2);
      expect(chips[0]).toHaveAttribute('data-partial', 'true');
      expect(chips[2]).toHaveAttribute('data-partial', 'true');
      expect(chips[1]).not.toHaveAttribute('data-partial');
    });

    it('renders the sleep toggle and the panel switch mixed', async () => {
      await renderTwo({ sleepWhenLocked: true, nexusPanel: true }, { sleepWhenLocked: false, nexusPanel: false });
      // Mixed switches render as checkboxes so assistive tech announces "mixed", not "off".
      expect(screen.getByRole('checkbox', { name: 'devices.lcd.sleepWhenLocked' })).toHaveAttribute('aria-checked', 'mixed');
      expect(screen.getByRole('checkbox', { name: 'devices.lianli-wireless.nexusPanelUse' })).toHaveAttribute('aria-checked', 'mixed');
    });

    it('renders nothing mixed when the screens agree', async () => {
      await renderTwo({ brightness: 70, rotation: 1 }, { brightness: 70, rotation: 1 });
      expect(screen.getByRole('slider', { name: 'devices.lianli-wireless.brightness' })).not.toHaveAttribute('data-mixed');
      const group = screen.getByRole('radiogroup', { name: 'devices.lianli-wireless.rotationLabel' });
      expect(within(group).getAllByRole('radio').filter(c => c.getAttribute('aria-checked') === 'true')).toHaveLength(1);
      expect(group.querySelector('[data-partial]')).toBeNull();
      expect(screen.getByRole('switch', { name: 'devices.lcd.sleepWhenLocked' })).toHaveAttribute('aria-checked', 'true');
    });

    it('highlights no gallery tile when the screens show different items', async () => {
      await renderTwo({ mediaId: 'm1' }, { mediaId: 'm3' });
      expect(screen.getByRole('button', { name: 'Wallpaper' })).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByRole('button', { name: 'Poster' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('shows only the gallery when Media is picked over mixed content types', async () => {
      await renderTwo({ contentType: 'sensor' }, { contentType: 'clock' });
      fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.contentTypeAria' }));
      await act(async () => {
        fireEvent.click(screen.getByRole('option', { name: 'devices.lianli-wireless.contentTypeMedia' }));
      });

      expect(screen.getByText('Loop')).toBeInTheDocument();
      expect(screen.queryByText('devices.lianli-wireless.sensorSourceLabel')).not.toBeInTheDocument();
      expect(screen.queryByText('devices.lianli-wireless.clockFaceLabel')).not.toBeInTheDocument();
      expect(mockSetContent).not.toHaveBeenCalled();
    });

    it('shows no sensor controls while Media is pending on a sensor screen', async () => {
      mockGetScreens.mockResolvedValue([panelScreen({ contentType: 'sensor' })]);
      await renderTab();
      expect(screen.getByText('devices.lianli-wireless.sensorSourceLabel')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.contentTypeAria' }));
      await act(async () => {
        fireEvent.click(screen.getByRole('option', { name: 'devices.lianli-wireless.contentTypeMedia' }));
      });

      expect(screen.queryByText('devices.lianli-wireless.sensorSourceLabel')).not.toBeInTheDocument();
      expect(screen.getByText('Loop')).toBeInTheDocument();
    });

    it('shows a sensor source as mixed when the screens differ', async () => {
      await renderTwo(
        { contentType: 'sensor', sensorSource: 'cpuTemp' },
        { contentType: 'sensor', sensorSource: 'gpuLoad' },
      );
      expect(screen.getByRole('button', { name: 'devices.lianli-wireless.sensorSourceLabel' }))
        .toHaveTextContent('common.mixed');
    });
  });

  it('hides brightness and sleep when the family has neither', async () => {
    await act(async () => {
      render(<LianLiWirelessScreenTab supportsBrightness={false} supportsSleepWhenLocked={false} />);
    });

    expect(screen.queryByText('devices.lianli-wireless.brightness')).not.toBeInTheDocument();
    expect(screen.queryByText('devices.lcd.sleepWhenLocked')).not.toBeInTheDocument();
    expect(screen.getByText('devices.lianli-wireless.rotationLabel')).toBeInTheDocument();
  });

  it('offers one Media entry instead of Picture, Dynamic and Video', async () => {
    await renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.contentTypeAria' }));
    const names = screen.getAllByRole('option').map(o => o.textContent);

    expect(names).toEqual([
      'devices.lianli-wireless.contentTypeOff',
      'devices.lianli-wireless.contentTypeMedia',
      'devices.lianli-wireless.contentTypeSensor',
      'devices.lianli-wireless.contentTypeClock',
      'devices.lianli-wireless.contentTypeAnimation',
    ]);
  });

  it('shows a stored gif as Media with the shared gallery', async () => {
    mockGetScreens.mockResolvedValue([
      { serial: 'S1', position: 0, width: 400, height: 400, brightness: 80, rotation: 0, contentType: 'gif', mediaId: 'm2' },
    ]);
    await renderTab();

    expect(screen.getByRole('button', { name: 'devices.lianli-wireless.contentTypeAria' }))
      .toHaveTextContent('devices.lianli-wireless.contentTypeMedia');
    expect(screen.getByText('Wallpaper')).toBeInTheDocument();
    expect(screen.getByText('Loop')).toBeInTheDocument();
  });

  it('choosing Media posts nothing until an item is picked', async () => {
    mockGetScreens.mockResolvedValue([
      { serial: 'S1', position: 0, width: 400, height: 400, brightness: 80, rotation: 0, contentType: 'off' },
    ]);
    await renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-wireless.contentTypeAria' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'devices.lianli-wireless.contentTypeMedia' }));
    });

    expect(mockSetContent).not.toHaveBeenCalled();
    expect(screen.getByText('Loop')).toBeInTheDocument();
  });

  it('posts the item kind when a video is picked', async () => {
    mockGetMedia.mockResolvedValue([...mediaData, { id: 'm9', name: 'Clip', kind: 'video' }]);
    await renderTab();
    await act(async () => { fireEvent.click(screen.getByText('Clip')); });

    expect(mockSetContent).toHaveBeenCalledWith('S1', 'video', 'm9');
  });

  it('sends a Klipy pick through the cropper into the library import', async () => {
    await renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'lighting.controls.klipyBrowse' }));
    await waitFor(() => expect(mockSearchKlipy).toHaveBeenCalled());
    const pick = await screen.findByRole('button', { name: /Cat/ });
    await act(async () => { fireEvent.click(pick); });

    await waitFor(() => expect(mockStageKlipy).toHaveBeenCalledWith('cat'));
    const dialog = await screen.findByRole('dialog', { name: 'cropper.title' });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'cropper.confirm' }));
    });

    await waitFor(() => expect(mockImportMedia).toHaveBeenCalledTimes(1));
    expect(mockFetchStaged).toHaveBeenCalled();
    expect(mockImportMedia.mock.calls[0][0]).toBeInstanceOf(File);
  });
});

describe('LianLiWirelessScreenTab Restart LCD', () => {
  async function renderRestart(isRestarting: (serial: string) => boolean = () => false) {
    const onRestart = vi.fn();
    await act(async () => {
      render(<LianLiWirelessScreenTab lcdRestart={{ isRestarting, onRestart }} />);
    });
    return onRestart;
  }

  it('restarts the selected screen', async () => {
    const onRestart = await renderRestart();
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-flex.restartLcdButton' }));
    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(onRestart).toHaveBeenCalledWith('S1');
  });

  it('restarts every selected screen in multiple mode', async () => {
    const onRestart = await renderRestart();
    fireEvent.click(screen.getByRole('radio', { name: 'devices.lianli-wireless.selectionModeMultiple' }));
    fireEvent.click(fanTile(2));
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-flex.restartLcdButton' }));
    expect(onRestart.mock.calls.map(c => c[0]).sort()).toEqual(['S1', 'S2']);
  });

  it('shows the pending label and disables the button while the screen restarts', async () => {
    await renderRestart(serial => serial === 'S1');
    const button = screen.getByRole('button', { name: 'devices.lianli-flex.restartingLcd' });
    expect(button).toBeDisabled();
  });

  it('has no Restart LCD row for a family that cannot restart', async () => {
    await renderTab();
    expect(screen.queryByText('devices.lianli-flex.restartLcd')).not.toBeInTheDocument();
  });
});
