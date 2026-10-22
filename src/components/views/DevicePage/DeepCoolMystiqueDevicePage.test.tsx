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
const mockUpload = vi.fn();
const mockDelete = vi.fn();
const mockShow = vi.fn();
const mockProgress = vi.fn();

vi.mock('../../common/Toast/Toast', () => ({
  useToast: () => ({ push: mockPush }),
}));

vi.mock('../../../api/deepcool-mystique', () => ({
  getMystiqueState: () => mockGet(),
  setMystiqueSettings: (patch: unknown) => mockSet(patch),
  uploadMystiqueMedia: (...args: unknown[]) => mockUpload(...args),
  deleteMystiqueMedia: (id?: string) => mockDelete(id),
  showMystiqueGif: (id: string) => mockShow(id),
  getMystiqueProgress: () => mockProgress(),
  mystiqueThumbUrl: (id: string, version: number) => `thumb/${id}/${version}`,
  mystiqueSourceUrl: (id: string) => `source/${id}`,
  MYSTIQUE_WIDTH: 480,
  MYSTIQUE_HEIGHT: 640,
  MYSTIQUE_MAX_PICTURES: 9,
  MYSTIQUE_MAX_GIFS: 9,
  MYSTIQUE_MAX_GIF_SECONDS: 10,
  MYSTIQUE_MAX_GIF_FRAMES: 149,
}));

const mockStage = vi.fn();
const mockFetchStaged = vi.fn();
const mockCancelStage = vi.fn();

vi.mock('../../../api/klipy', () => ({
  stageKlipy: (slug: string) => mockStage(slug),
}));

vi.mock('../../../api/mediaLibrary', () => ({
  cancelMediaStage: (id: string) => mockCancelStage(id),
  fetchStagedFile: (url: string, name: string) => mockFetchStaged(url, name),
  mediaStagePreviewUrl: (id: string) => `preview/${id}`,
  mediaStageRawUrl: (id: string) => `raw/${id}`,
  stagePreviewFor: (kind: string, rawUrl: string, previewUrl: string) => ({ src: rawUrl, kind: kind === 'video' ? 'video' : 'image', fallbackSrc: previewUrl }),
}));

vi.mock('../../common/KlipyPicker/KlipyPicker', () => ({
  KlipyPicker: ({ open, onPick }: { open: boolean; onPick: (gif: { slug: string; title: string; width: number; height: number }) => void }) => (
    open ? <button type="button" data-testid="klipy-pick" onClick={() => onPick({ slug: 'cat', title: 'cat', width: 200, height: 200 })}>pick</button> : null
  ),
}));

vi.mock('../../common/MediaCropper/MediaCropper', () => ({
  MediaCropper: ({ onConfirm, aspect, busyProgress }: {
    onConfirm: (crop: unknown) => void;
    aspect: number;
    busyProgress?: { percent: number; message: string } | null;
  }) => (
    <button
      type="button"
      data-testid="crop-confirm"
      data-aspect={aspect}
      data-progress={busyProgress ? `${busyProgress.message} ${busyProgress.percent}` : ''}
      onClick={() => onConfirm({ x: 0, y: 0, w: 1, h: 1 })}
    >
      crop
    </button>
  ),
}));

vi.mock('../../../panel/widgets/monitoring/sensorPicker', () => ({
  sensorsForDevice: (_s: unknown, _n: unknown, _e: unknown, category: string) => {
    if (category === 'motherboard') return [{ type: 'Fan' }, { type: 'Temperature' }];
    if (category === 'cpu') return [{ type: 'Temperature' }, { type: 'Clock' }, { type: 'Load' }];
    return [];
  },
}));

vi.mock('../../../panel/widgets/monitoring/picker/SensorPicker', () => ({
  useSensorLookup: () => ({ resolve: () => undefined, sensors: {}, networkSensors: [], extras: {} }),
  SensorPicker: ({ category, sensor, categories, automatic, onChange }: {
    category: string;
    sensor: string;
    categories: string[];
    automatic: { label: string; active: boolean; onSelect: () => void };
    onChange: (s: { category: string; sensor: string }) => void;
  }) => (
    <div>
      <button type="button" data-testid="sensor-picker" onClick={() => onChange({ category: 'motherboard', sensor: 'fan/chassis' })}>
        {category}/{sensor}
      </button>
      <button type="button" data-testid="automatic-option" data-active={String(automatic.active)} data-categories={categories.join(',')} onClick={automatic.onSelect}>
        {automatic.label}
      </button>
    </div>
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
  mediaChosen: true,
  sourceChosen: true,
  readoutStyle: 'normal',
  auxArea: 'coreData',
  switchSeconds: 3,
  animation: 'split',
  mediaSource: 'images',
  edgePicking: false,
  media: [] as { kind: string; id: string; name: string; ext?: string; editable?: boolean }[],
  cpuTemperature: { category: '', sensor: '', resolvedCategory: 'quick', resolvedSensor: 'summary/cpu-temp' },
  cpuFrequency: { category: '', sensor: '', resolvedCategory: 'cpu', resolvedSensor: 'cpu/clock/core-max' },
  cpuUsage: { category: '', sensor: '', resolvedCategory: 'quick', resolvedSensor: 'summary/cpu-usage' },
  ramUsage: { category: '', sensor: '', resolvedCategory: 'quick', resolvedSensor: 'summary/memory-usage' },
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
  mockUpload.mockResolvedValue({ ok: true, msg: '' });
  mockDelete.mockResolvedValue(true);
  mockShow.mockResolvedValue({ ok: true, needsEdit: false });
  mockProgress.mockResolvedValue({ phase: '', percent: 0 });
  mockCancelStage.mockResolvedValue(undefined);
  URL.createObjectURL = vi.fn(() => 'blob:pick');
  URL.revokeObjectURL = vi.fn();
});

const PICTURE_A = '2101b6e6277841daa821e8d79a5c528b';
const GIF_A = 'acd9325521f3493c86bfc0b0aa85658d';

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

  it('edge picking sits with the display settings it is sent with, in every mode', async () => {
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'devices.deepcool-mystique.edgePicking' }));
    });
    expect(mockSet).toHaveBeenCalledWith({ edgePicking: true });
  });

  it('picking a fan sensor sends the pick', async () => {
    await mount();
    await act(async () => {
      fireEvent.click(screen.getAllByTestId('sensor-picker')[4]);
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
    const option = screen.getAllByTestId('automatic-option')[4];
    expect(option.getAttribute('data-active')).toBe('false');
    await act(async () => {
      fireEvent.click(option);
    });
    expect(mockSet).toHaveBeenCalledWith({ cpuFan: { category: '', sensor: '' } });
  });

  it('marks the automatic option active while a readout is automatic', async () => {
    await mount();
    expect(screen.getAllByTestId('automatic-option')).toHaveLength(6);
    expect(screen.getAllByTestId('automatic-option')[4].getAttribute('data-active')).toBe('true');
  });

  it('offers only categories that list a fan reading', async () => {
    await mount();
    const options = screen.getAllByTestId('automatic-option');
    expect(options[4].getAttribute('data-categories')).toBe('motherboard');
    expect(options[1].getAttribute('data-categories')).toBe('cpu');
  });

  it('a right-click on the brightness slider neither holds off polling nor writes', async () => {
    await mount();
    const slider = screen.getByRole('slider');
    await act(async () => {
      fireEvent.pointerDown(slider, { button: 2, pointerId: 1 });
      fireEvent.pointerUp(slider, { button: 2, pointerId: 1 });
      await new Promise(r => setTimeout(r, 10));
    });
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('a brightness commit that changes nothing sends nothing', async () => {
    await mount();
    const slider = screen.getByRole('slider');
    await act(async () => {
      fireEvent.pointerDown(slider, { button: 0, pointerId: 1 });
      fireEvent.pointerUp(slider, { button: 0, pointerId: 1 });
      await new Promise(r => setTimeout(r, 10));
    });
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('a changed brightness sends once', async () => {
    await mount();
    const slider = screen.getByRole('slider');
    await act(async () => {
      fireEvent.pointerDown(slider, { button: 0, pointerId: 1 });
      fireEvent.change(slider, { target: { value: '40' } });
      fireEvent.pointerUp(slider, { button: 0, pointerId: 1 });
      await new Promise(r => setTimeout(r, 10));
    });
    expect(mockSet).toHaveBeenCalledWith({ brightness: 40 });
    expect(mockSet).toHaveBeenCalledTimes(1);
  });

  it('marks the readout, recording and system groups as not set until the user changes them', async () => {
    await mount({ ...base, readoutChosen: false, recordingChosen: false, deviceChosen: false });
    expect(screen.getByText('devices.deepcool-mystique.deviceUnsetHint')).toBeTruthy();
    expect(screen.getAllByText('devices.deepcool-mystique.notSet').length).toBeGreaterThan(0);
  });

  it('shows no unset note once the system group has been chosen', async () => {
    await mount();
    expect(screen.queryByText('devices.deepcool-mystique.deviceUnsetHint')).toBeNull();
    expect(screen.getByText('devices.deepcool-mystique.deviceSetHint')).toBeTruthy();
  });

  it('monitor mode offers the style and the auxiliary display area with the readout', async () => {
    await mount();
    expect(screen.getByText('devices.deepcool-mystique.style')).toBeTruthy();
    expect(screen.getByText('devices.deepcool-mystique.auxArea')).toBeTruthy();
    expect(screen.getByText('devices.deepcool-mystique.readoutSetHint')).toBeTruthy();
  });

  it('media mode sends switch time, animation and source at once', async () => {
    await mount({ ...base, mode: 'media' });
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'devices.deepcool-mystique.seconds:{"value":5}' }));
    });
    expect(mockSet).toHaveBeenCalledWith({ switchSeconds: 5 });
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'devices.deepcool-mystique.animationFade' }));
    });
    expect(mockSet).toHaveBeenCalledWith({ animation: 'fade' });
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'devices.deepcool-mystique.playGif' }));
    });
    expect(mockSet).toHaveBeenCalledWith({ mediaSource: 'gif' });
  });

  it('media mode leads each grid with an add tile and lists every item', async () => {
    await mount({ ...base, mode: 'media', media: [{ kind: 'picture', id: PICTURE_A, name: 'spider' }, { kind: 'gif', id: GIF_A, name: 'logo' }] });
    expect(screen.getByText('spider')).toBeTruthy();
    expect(screen.getByText('logo')).toBeTruthy();
    expect(screen.getAllByText('devices.deepcool-mystique.addPicture').length).toBe(1);
    expect(screen.getByText('devices.deepcool-mystique.addGif')).toBeTruthy();
    expect(screen.getByText('devices.deepcool-mystique.mediaSetHint')).toBeTruthy();
  });

  it('editing waits for a selection, then re-crops the kept source and uploads it under the same id', async () => {
    const source = new File([new Uint8Array([1, 2, 3])], 'spider.png', { type: 'image/png' });
    mockFetchStaged.mockResolvedValue(source);
    await mount({ ...base, mode: 'media', media: [{ kind: 'picture', id: PICTURE_A, name: 'spider', ext: '.png', editable: true }] });
    const edit = () => screen.getAllByRole('button', { name: 'devices.deepcool-mystique.editSelected' })[0] as HTMLButtonElement;
    expect(edit().disabled).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'devices.deepcool-mystique.selectItem:{"name":"spider"}' }));
    });
    expect(edit().disabled).toBe(false);
    await act(async () => {
      fireEvent.click(edit());
    });
    expect(screen.getByTestId('crop-confirm').getAttribute('data-aspect')).toBe(String(480 / 640));
    await act(async () => {
      fireEvent.click(screen.getByTestId('crop-confirm'));
    });
    expect(mockFetchStaged).toHaveBeenCalledWith(`source/${PICTURE_A}`, 'spider.png');
    expect(mockUpload).toHaveBeenCalledWith(source, 'picture', { x: 0, y: 0, w: 1, h: 1 }, PICTURE_A);
    expect(mockCancelStage).not.toHaveBeenCalled();
  });

  it('an item whose source was not kept cannot be edited', async () => {
    await mount({ ...base, mode: 'media', media: [{ kind: 'picture', id: PICTURE_A, name: 'spider', ext: '', editable: false }] });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'devices.deepcool-mystique.selectItem:{"name":"spider"}' }));
    });
    expect((screen.getAllByRole('button', { name: 'devices.deepcool-mystique.editSelected' })[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it('the add tile of a full grid explains why instead of opening a picker', async () => {
    const media = Array.from({ length: 9 }, (_, i) => ({ kind: 'picture', id: `${i}`.repeat(32), name: `p${i}` }));
    await mount({ ...base, mode: 'media', media });
    const input = document.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement;
    const click = vi.spyOn(input, 'click');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'devices.deepcool-mystique.addPicture' }));
    });
    expect(click).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith({ title: 'devices.deepcool-mystique.mediaFullTitle', body: 'devices.deepcool-mystique.mediaFullBody' });
  });

  it('removing one item or all of them asks first, then refreshes the list', async () => {
    await mount({ ...base, mode: 'media', media: [{ kind: 'picture', id: PICTURE_A, name: 'spider' }] });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'devices.deepcool-mystique.removeItem:{"name":"spider"}' }));
    });
    expect(mockDelete).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'devices.deepcool-mystique.remove' }));
    });
    expect(mockDelete).toHaveBeenCalledWith(PICTURE_A);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'devices.deepcool-mystique.removeAllButton' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'devices.deepcool-mystique.remove' }));
    });
    expect(mockDelete).toHaveBeenLastCalledWith(undefined);
  });

  it('media actions wait while a removal runs, and the hints carry the slot counts', async () => {
    let finish: (ok: boolean) => void = () => {};
    mockDelete.mockReturnValue(new Promise<boolean>(resolve => { finish = resolve; }));
    await mount({ ...base, mode: 'media', media: [{ kind: 'picture', id: PICTURE_A, name: 'spider' }] });
    expect(screen.getByText('devices.deepcool-mystique.picturesHint:{"count":9}')).toBeTruthy();
    expect(screen.getByText('devices.deepcool-mystique.gifHint:{"count":9,"seconds":10,"frames":149}')).toBeTruthy();
    const removeAll = () => screen.getByRole('button', { name: 'devices.deepcool-mystique.removeAllButton' }) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(removeAll());
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'devices.deepcool-mystique.remove' }));
    });
    expect(removeAll().disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'devices.deepcool-mystique.removeItem:{"name":"spider"}' })).toBeNull();
    mockGet.mockResolvedValue({ ...base, mode: 'media', media: [] });
    await act(async () => {
      finish(true);
    });
    expect(screen.queryByText('spider')).toBeNull();
  });

  it('source, switch time and animation wait while an upload runs, and the grids note how the screen plays', async () => {
    let finish: (r: { ok: boolean }) => void = () => {};
    mockUpload.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await mount({ ...base, mode: 'media' });
    expect(screen.getByText('devices.deepcool-mystique.playbackHint')).toBeTruthy();
    const chips = () => [
      screen.getByRole('radio', { name: 'devices.deepcool-mystique.playGif' }),
      screen.getByRole('radio', { name: 'devices.deepcool-mystique.seconds:{"value":5}' }),
      screen.getByRole('radio', { name: 'devices.deepcool-mystique.animationFade' }),
    ] as HTMLButtonElement[];
    expect(chips().every(c => !c.disabled)).toBe(true);
    const input = document.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement;
    mockProgress.mockResolvedValue({ phase: 'converting', percent: 30 });
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File([new Uint8Array([1])], 'a.png', { type: 'image/png' })] } });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('crop-confirm'));
    });
    expect(chips().every(c => c.disabled)).toBe(true);
    expect(screen.getByTestId('crop-confirm').getAttribute('data-progress')).toBe('devices.deepcool-mystique.progressConverting 30');
    await act(async () => {
      finish({ ok: true });
    });
    expect(chips().every(c => !c.disabled)).toBe(true);
  });

  it('a GIF click sends it to the screen with its progress, and a picture click plays the pictures', async () => {
    let finish: (r: { ok: boolean; needsEdit: boolean }) => void = () => {};
    mockShow.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    mockProgress.mockResolvedValue({ phase: 'sending', percent: 40 });
    await mount({
      ...base,
      mode: 'media',
      mediaSource: 'gif',
      media: [{ kind: 'picture', id: PICTURE_A, name: 'spider' }, { kind: 'gif', id: GIF_A, name: 'logo' }],
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'devices.deepcool-mystique.showGif:{"name":"logo"}' }));
    });
    expect(mockShow).toHaveBeenCalledWith(GIF_A);
    expect(screen.getByText('devices.deepcool-mystique.progressSending (40%)')).toBeTruthy();
    mockGet.mockResolvedValue({
      ...base,
      mode: 'media',
      mediaSource: 'gif',
      shownGif: GIF_A,
      media: [{ kind: 'picture', id: PICTURE_A, name: 'spider' }, { kind: 'gif', id: GIF_A, name: 'logo' }],
    });
    await act(async () => {
      finish({ ok: true, needsEdit: false });
    });
    expect(screen.queryByText('devices.deepcool-mystique.progressSending (40%)')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'devices.deepcool-mystique.showGif:{"name":"logo"}' }));
    });
    expect(mockShow).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'devices.deepcool-mystique.selectItem:{"name":"spider"}' }));
    });
    expect(mockSet).toHaveBeenCalledWith({ mediaSource: 'images' });
  });

  it('a GIF whose frames were not kept opens the cropper to send it again, and a refused one raises a toast', async () => {
    mockShow.mockResolvedValue({ ok: false, needsEdit: true });
    await mount({ ...base, mode: 'media', media: [{ kind: 'gif', id: GIF_A, name: 'logo', ext: '.gif', editable: true }] });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'devices.deepcool-mystique.showGif:{"name":"logo"}' }));
    });
    expect(mockPush).toHaveBeenCalledWith({ title: 'devices.deepcool-mystique.needsEditTitle', body: 'devices.deepcool-mystique.needsEditBody' });
    expect(screen.getByTestId('crop-confirm')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByTestId('crop-confirm'));
    });
    expect(mockUpload).toHaveBeenCalledWith(expect.anything(), 'gif', { x: 0, y: 0, w: 1, h: 1 }, GIF_A);

    mockShow.mockResolvedValue({ ok: false, needsEdit: false });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'devices.deepcool-mystique.showGif:{"name":"logo"}' }));
    });
    expect(mockPush).toHaveBeenLastCalledWith({ title: 'devices.deepcool-mystique.showFailedTitle', body: 'devices.deepcool-mystique.showFailedBody' });
  });

  it('a GIF or video picked from disk uploads as the GIF and a refusal raises a toast', async () => {
    mockUpload.mockResolvedValue({ ok: false, msg: 'refused' });
    await mount({ ...base, mode: 'media' });
    const file = new File([new Uint8Array([1])], 'loop.mp4', { type: 'video/mp4' });
    const input = document.querySelector('input[type="file"][accept="image/gif,video/*"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('crop-confirm'));
    });
    expect(mockUpload).toHaveBeenCalledWith(file, 'gif', { x: 0, y: 0, w: 1, h: 1 }, undefined);
    expect(mockPush).toHaveBeenCalledWith({ title: 'devices.deepcool-mystique.uploadFailedTitle', body: 'devices.deepcool-mystique.uploadFailedBody' });
  });

  it('a Klipy pick is staged, cropped and uploaded as the GIF', async () => {
    const staged = new File([new Uint8Array([9])], 'cat.mp4', { type: 'video/mp4' });
    mockStage.mockResolvedValue({ stageId: 's1', mediaKind: 'video' });
    mockFetchStaged.mockResolvedValue(staged);
    await mount({ ...base, mode: 'media' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'lighting.controls.klipyBrowse' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('klipy-pick'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('crop-confirm'));
    });
    expect(mockFetchStaged).toHaveBeenCalledWith('raw/s1', 'cat.mp4');
    expect(mockUpload).toHaveBeenCalledWith(staged, 'gif', { x: 0, y: 0, w: 1, h: 1 }, undefined);
    expect(mockCancelStage).toHaveBeenCalledWith('s1');
  });

  it('recording mode notes that the toggles are not set yet', async () => {
    await mount({ ...base, mode: 'recording', recordingChosen: false });
    expect(screen.getByText('devices.deepcool-mystique.recordingUnsetHint')).toBeTruthy();
  });

  it('picking the CPU frequency or RAM usage sensor sends that pick', async () => {
    await mount();
    await act(async () => {
      fireEvent.click(screen.getAllByTestId('sensor-picker')[1]);
    });
    expect(mockSet).toHaveBeenCalledWith({ cpuFrequency: { category: 'motherboard', sensor: 'fan/chassis' } });
    await act(async () => {
      fireEvent.click(screen.getAllByTestId('sensor-picker')[3]);
    });
    expect(mockSet).toHaveBeenCalledWith({ ramUsage: { category: 'motherboard', sensor: 'fan/chassis' } });
  });

  it('the usage readouts return to automatic like the others', async () => {
    await mount({ ...base, ramUsage: { category: 'memory', sensor: 'm/l', resolvedCategory: 'memory', resolvedSensor: 'm/l' } });
    await act(async () => {
      fireEvent.click(screen.getAllByTestId('automatic-option')[3]);
    });
    expect(mockSet).toHaveBeenCalledWith({ ramUsage: { category: '', sensor: '' } });
  });

  it('an automatic readout that resolves to nothing shows a sensible default category per readout', async () => {
    const none = { category: '', sensor: '', resolvedCategory: '', resolvedSensor: '' };
    await mount({ ...base, cpuTemperature: none, cpuFrequency: none, cpuUsage: none, ramUsage: none, cpuFan: none, pump: none });
    const shown = screen.getAllByTestId('sensor-picker').map(b => b.textContent);
    expect(shown).toEqual(['cpu/', 'cpu/', 'cpu/', 'memory/', 'motherboard/', 'motherboard/']);
  });
});
