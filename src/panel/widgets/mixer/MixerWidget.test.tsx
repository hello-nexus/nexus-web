// t() is uninitialised under vitest and returns the raw key, so assertions use
// key strings for copy and the strip's own label for identity.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AudioDeviceList, AudioMixerState } from '../../../api/mixer';
import type { PanelConfigValue, PanelWidget } from '../../types';
import { MixerWidget } from './MixerWidget';

const fetchAudioMixer = vi.fn<() => Promise<AudioMixerState | null>>();
const setSessionVolume = vi.fn();
const setSessionMuted = vi.fn();
const applyMixerPreset = vi.fn();
const fetchAudioDevices = vi.fn<() => Promise<AudioDeviceList | null>>();
const setDefaultOutput = vi.fn(() => Promise.resolve(null));
const setDefaultInput = vi.fn(() => Promise.resolve(null));
const setSpatialSound = vi.fn(() => Promise.resolve(null));

vi.mock('../../../api/mixer', () => ({
  fetchAudioMixer: () => fetchAudioMixer(),
  setSessionVolume: (id: string, volume: number, commit: boolean) => setSessionVolume(id, volume, commit),
  setSessionMuted: (id: string, muted: boolean) => setSessionMuted(id, muted),
  setMixerSticky: vi.fn(),
  clearMixerLevels: vi.fn(),
  saveMixerPreset: vi.fn(),
  deleteMixerPreset: vi.fn(),
  applyMixerPreset: (id: string) => applyMixerPreset(id),
  fetchAudioDevices: () => fetchAudioDevices(),
  setDefaultOutput: (id: string) => setDefaultOutput(id),
  setDefaultInput: (id: string) => setDefaultInput(id),
  setSpatialSound: (deviceId: string, formatId: string) => setSpatialSound(deviceId, formatId),
}));

vi.mock('../../../hooks/useSystemVolume', () => ({
  useSystemVolume: () => ({
    state: { supported: true, volume: 0.5, muted: false },
    previewVolume: vi.fn(),
    commitVolume: vi.fn(),
    setMuted: vi.fn(),
  }),
}));

// The icon route is exercised by the monitoring process list's own tests; here
// it would only add a fetch.
vi.mock('../../../hooks/useProcessIcon', () => ({ useProcessIcon: () => null }));

const MUTE = 'panel.widget.mixer.aria.mute';
const PICK_OUTPUT = 'panel.widget.mixer.aria.pickOutput';
const NEXT_PAGE = 'panel.widget.mixer.aria.nextPage';
const PREV_PAGE = 'panel.widget.mixer.aria.prevPage';
const NEXT_FADERS = 'panel.widget.mixer.aria.nextFaders';
const NEXT_PRESETS = 'panel.widget.mixer.aria.nextPresets';
const BACK = 'panel.widget.mixer.aria.closePicker';
const TAB_OUTPUT = 'panel.widget.mixer.output';
const TAB_INPUT = 'panel.widget.mixer.input';
const TAB_SPATIAL = 'panel.widget.mixer.spatial';
const SPATIAL_OFF = 'panel.widget.mixer.spatialOff';
const UNSUPPORTED = 'panel.widget.mixer.unsupported';
const EMPTY = 'panel.widget.mixer.empty';

function state(overrides: Partial<AudioMixerState> = {}): AudioMixerState {
  return {
    error: false,
    msg: '',
    supported: true,
    stickyLevels: true,
    presets: [],
    sessions: [
      { id: 'game', name: 'Helldivers 2', volume: 0.55, muted: false, peak: 0.4, active: true },
      { id: 'spotify', name: 'Spotify', volume: 0.2, muted: true, peak: 0, active: false },
    ],
    ...overrides,
  };
}

function renderWidget(config: Record<string, PanelConfigValue> = {}) {
  const widget: PanelWidget = { id: 'mixer-1', type: 'mixer', size: '4x4', col: 0, row: 0, config };
  return render(<MixerWidget widget={widget} surface="y70" />);
}

function devices(): AudioDeviceList {
  return {
    error: false,
    msg: '',
    outputs: [
      { id: 'out-headset', name: 'Arctis Nova Pro', isDefault: true, direction: 'output' },
      { id: 'out-speakers', name: 'Speakers', isDefault: false, direction: 'output' },
    ],
    inputs: [{ id: 'in-mic', name: 'Shure MV7', isDefault: true, direction: 'input' }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchAudioMixer.mockResolvedValue(state());
  fetchAudioDevices.mockResolvedValue(devices());
});


/**
 * jsdom lays nothing out, so the chip widths the preset pager measures have to
 * be supplied. Keyed off the data-pager-key the row puts on every chip.
 */
function stubChipWidths(chipWidths: Record<string, number>, stageWidth: number, scale = 1) {
  // Panel widgets sit inside a transform: scale() wrapper, so every rect comes
  // back scaled while clientWidth stays in layout px. The stage's own rect is
  // what the hook divides by, so it has to be scaled here too or the test is
  // measuring a world that cannot exist.
  const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
  rect.mockImplementation(function (this: HTMLElement) {
    const key = this.getAttribute('data-pager-key');
    if (key) return { width: (chipWidths[key] ?? 0) * scale } as DOMRect;
    if (String(this.className).includes('presetStage')) return { width: stageWidth * scale } as DOMRect;
    return { width: 0 } as DOMRect;
  });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return String(this.className).includes('presetStage') ? stageWidth : 0;
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
});

describe('MixerWidget', () => {
  it('renders the system strip ahead of one strip per app', async () => {
    renderWidget();
    await waitFor(() => expect(screen.getByText('Helldivers 2')).toBeTruthy());

    const labels = screen.getAllByRole('slider').map(s => s.getAttribute('aria-valuenow'));
    // master 50, game 55, spotify 20
    expect(labels).toEqual(['50', '55', '20']);
  });

  it('muting an app writes that app, not the master', async () => {
    renderWidget({ showMaster: false });
    await waitFor(() => expect(screen.getByText('Helldivers 2')).toBeTruthy());

    fireEvent.click(screen.getAllByRole('button', { name: MUTE })[0]);
    expect(setSessionMuted).toHaveBeenCalledWith('game', true);
  });

  it('hides idle apps when configured', async () => {
    renderWidget({ hideIdle: true });
    await waitFor(() => expect(screen.getByText('Helldivers 2')).toBeTruthy());
    expect(screen.queryByText('Spotify')).toBeNull();
  });

  it('applies a preset from its chip', async () => {
    fetchAudioMixer.mockResolvedValue(state({
      presets: [{ id: 'p1', name: 'Gaming', masterVolume: 0.7, apps: [] }],
    }));
    renderWidget();
    await waitFor(() => expect(screen.getByText('Gaming')).toBeTruthy());

    fireEvent.click(screen.getByText('Gaming'));
    expect(applyMixerPreset).toHaveBeenCalledWith('p1');
  });

  it('pages the device list only once it overflows', async () => {
    fetchAudioDevices.mockResolvedValue({
      error: false,
      msg: '',
      outputs: Array.from({ length: 8 }, (_, i) => ({
        id: `out-${i}`, name: `Output ${i}`, isDefault: i === 0, direction: 'output',
      })),
      inputs: [],
    });
    renderWidget();
    await waitFor(() => expect(screen.getByText('Helldivers 2')).toBeTruthy());
    fireEvent.click(screen.getByLabelText(PICK_OUTPUT));

    // 8 outputs over two pages of five; the tab row is docked, not paged.
    expect(screen.getByText('Output 4')).toBeTruthy();
    expect(screen.queryByText('Output 6')).toBeNull();
    expect(screen.getByLabelText(BACK)).toBeTruthy();

    fireEvent.click(screen.getByLabelText(NEXT_PAGE));
    expect(screen.getByText('Output 6')).toBeTruthy();
    // Docked: still there on page two.
    expect(screen.getByLabelText(BACK)).toBeTruthy();
    // No inputs, no spatial: only the output tab exists.
    expect(screen.getByText(TAB_OUTPUT)).toBeTruthy();
    expect(screen.queryByText(TAB_INPUT)).toBeNull();
    expect(screen.queryByText(TAB_SPATIAL)).toBeNull();
  });

  it('starts every tab on its first page', async () => {
    fetchAudioDevices.mockResolvedValue({
      error: false,
      msg: '',
      outputs: Array.from({ length: 8 }, (_, i) => ({
        id: `out-${i}`, name: `Output ${i}`, isDefault: i === 0, direction: 'output',
      })),
      inputs: [{ id: 'in-mic', name: 'Shure MV7', isDefault: true, direction: 'input' }],
    });
    renderWidget();
    await waitFor(() => expect(screen.getByText('Helldivers 2')).toBeTruthy());
    fireEvent.click(screen.getByLabelText(PICK_OUTPUT));
    fireEvent.click(screen.getByLabelText(NEXT_PAGE));
    expect(screen.getByText('Output 6')).toBeTruthy();

    fireEvent.click(screen.getByText(TAB_INPUT));
    expect(screen.getByText('Shure MV7')).toBeTruthy();
    fireEvent.click(screen.getByText(TAB_OUTPUT));
    // Back on page one, not the page the output tab was left on.
    expect(screen.getByText('Output 0')).toBeTruthy();
    expect(screen.queryByText('Output 6')).toBeNull();
  });

  it('falls back to the outputs when the spatial tab goes away, and stays there', async () => {
    const withSpatial = {
      ...devices(),
      spatial: {
        supported: true,
        deviceId: 'out-headset',
        activeId: '',
        formats: [{ id: 'sonic', name: 'Windows Sonic for Headphones' }],
      },
    };
    fetchAudioDevices.mockResolvedValue(withSpatial);
    renderWidget();
    await waitFor(() => expect(screen.getByText('Helldivers 2')).toBeTruthy());
    fireEvent.click(screen.getByLabelText(PICK_OUTPUT));
    fireEvent.click(screen.getByText(TAB_SPATIAL));
    expect(screen.getByText(SPATIAL_OFF)).toBeTruthy();

    // The default moves to an output without spatial sound: the tab vanishes
    // and the list falls back to the outputs.
    fetchAudioDevices.mockResolvedValue({ ...devices(), spatial: { supported: false, deviceId: '', activeId: '', formats: [] } });
    fireEvent.click(screen.getByText('Windows Sonic for Headphones'));
    await waitFor(() => expect(screen.queryByText(TAB_SPATIAL)).toBeNull());
    expect(screen.getByText('Speakers')).toBeTruthy();

    // Spatial coming back does not yank the view off the outputs.
    fetchAudioDevices.mockResolvedValue(withSpatial);
    fireEvent.click(screen.getByText('Speakers'));
    await waitFor(() => expect(screen.getByText(TAB_SPATIAL)).toBeTruthy());
    expect(screen.getByRole('tab', { name: TAB_OUTPUT }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Speakers')).toBeTruthy();
    expect(screen.queryByText(SPATIAL_OFF)).toBeNull();
  });

  it('pages the fader row only past four faders', async () => {
    // master + 3 apps fits; no arrows.
    renderWidget();
    await waitFor(() => expect(screen.getByText('Helldivers 2')).toBeTruthy());
    expect(screen.queryByLabelText(NEXT_FADERS)).toBeNull();
  });

  it('shows fader arrows once the row overflows four', async () => {
    fetchAudioMixer.mockResolvedValue(state({
      sessions: Array.from({ length: 6 }, (_, i) => ({
        id: `app-${i}`, name: `App ${i}`, volume: 0.5, muted: false, peak: 0, active: true,
      })),
    }));
    renderWidget();
    await waitFor(() => expect(screen.getByText('App 0')).toBeTruthy());

    // master + App 0-2 on page one.
    expect(screen.queryByText('App 3')).toBeNull();
    fireEvent.click(screen.getByLabelText(NEXT_FADERS));
    expect(screen.getByText('App 3')).toBeTruthy();
    expect(screen.getByText('App 5')).toBeTruthy();
  });

  it('says per-app volume is unavailable rather than showing an empty mixer', async () => {
    fetchAudioMixer.mockResolvedValue(state({ supported: false, sessions: [] }));
    renderWidget();
    await waitFor(() => expect(screen.getByText(UNSUPPORTED)).toBeTruthy());
    expect(screen.queryByText(EMPTY)).toBeNull();
  });

  it('distinguishes a supported mixer with nothing playing', async () => {
    fetchAudioMixer.mockResolvedValue(state({ sessions: [] }));
    renderWidget();
    await waitFor(() => expect(screen.getByText(EMPTY)).toBeTruthy());
  });

  it('names the output device the levels are measured against', async () => {
    renderWidget();
    await waitFor(() => expect(screen.getByText('Arctis Nova Pro')).toBeTruthy());
  });

  it('opening the picker swaps the faders for the device list', async () => {
    renderWidget();
    await waitFor(() => expect(screen.getByText('Helldivers 2')).toBeTruthy());

    fireEvent.click(screen.getByLabelText(PICK_OUTPUT));

    // The tab row leads with the back arrow, then the outputs open first -
    // this set fits one page, so no arrows appear at all.
    expect(screen.getByLabelText(BACK)).toBeTruthy();
    expect(screen.getByRole('tab', { name: TAB_OUTPUT }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Speakers')).toBeTruthy();
    expect(screen.queryByLabelText(NEXT_PAGE)).toBeNull();
    expect(screen.queryByLabelText(PREV_PAGE)).toBeNull();
    // The list takes over the tile, so the faders are gone while it is up.
    expect(screen.queryByText('Helldivers 2')).toBeNull();
    expect(screen.queryAllByRole('slider')).toHaveLength(0);

    // Inputs live on their own tab.
    expect(screen.queryByText('Shure MV7')).toBeNull();
    fireEvent.click(screen.getByText(TAB_INPUT));
    expect(screen.getByText('Shure MV7')).toBeTruthy();
    expect(screen.queryByText('Speakers')).toBeNull();
  });

  it('the back entry returns to the faders', async () => {
    renderWidget();
    await waitFor(() => expect(screen.getByText('Helldivers 2')).toBeTruthy());
    fireEvent.click(screen.getByLabelText(PICK_OUTPUT));
    expect(screen.queryByText('Helldivers 2')).toBeNull();

    fireEvent.click(screen.getByLabelText(BACK));
    expect(screen.getByText('Helldivers 2')).toBeTruthy();
  });

  it('picking an output switches the default and leaves the list open', async () => {
    renderWidget();
    await waitFor(() => expect(screen.getByText('Helldivers 2')).toBeTruthy());
    fireEvent.click(screen.getByLabelText(PICK_OUTPUT));

    fireEvent.click(screen.getByText('Speakers'));

    expect(setDefaultOutput).toHaveBeenCalledWith('out-speakers');
    // Still on the list: switching output is often followed by switching input.
    expect(screen.getByText(TAB_INPUT)).toBeTruthy();
    expect(screen.queryByText('Helldivers 2')).toBeNull();
  });

  it('lists spatial sound on its own tab and switches it', async () => {
    fetchAudioDevices.mockResolvedValue({
      ...devices(),
      spatial: {
        supported: true,
        deviceId: 'out-headset',
        activeId: '',
        formats: [{ id: 'sonic', name: 'Windows Sonic for Headphones' }],
      },
    });
    renderWidget();
    await waitFor(() => expect(screen.getByText('Helldivers 2')).toBeTruthy());
    fireEvent.click(screen.getByLabelText(PICK_OUTPUT));
    fireEvent.click(screen.getByText(TAB_SPATIAL));

    // Off leads the list and is what is active now.
    const off = screen.getByText(SPATIAL_OFF).closest('button');
    expect(off?.getAttribute('aria-pressed')).toBe('true');
    const sonic = screen.getByText('Windows Sonic for Headphones').closest('button');
    expect(sonic?.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(screen.getByText('Windows Sonic for Headphones'));

    expect(setSpatialSound).toHaveBeenCalledWith('out-headset', 'sonic');
    // Marked before the re-read lands, like an endpoint pick.
    expect(sonic?.getAttribute('aria-pressed')).toBe('true');
    expect(off?.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(screen.getByText(SPATIAL_OFF));
    expect(setSpatialSound).toHaveBeenLastCalledWith('out-headset', '');
  });

  it('offers no spatial tab where the service reports none', async () => {
    fetchAudioDevices.mockResolvedValue({
      ...devices(),
      spatial: { supported: false, deviceId: '', activeId: '', formats: [] },
    });
    renderWidget();
    await waitFor(() => expect(screen.getByText('Helldivers 2')).toBeTruthy());
    fireEvent.click(screen.getByLabelText(PICK_OUTPUT));

    expect(screen.getByText('Speakers')).toBeTruthy();
    expect(screen.queryByText(TAB_SPATIAL)).toBeNull();
    expect(screen.queryByText(SPATIAL_OFF)).toBeNull();
  });

  it('numbers endpoints that report the same name', async () => {
    // A GPU exposing one HDMI audio device per port names them all after the
    // monitor; two identical rows would be a coin flip.
    fetchAudioDevices.mockResolvedValue({
      error: false,
      msg: '',
      outputs: [
        { id: 'hdmi-1', name: 'DELL U2415', isDefault: true, direction: 'output' },
        { id: 'hdmi-2', name: 'DELL U2415', isDefault: false, direction: 'output' },
        { id: 'spk', name: 'Speakers', isDefault: false, direction: 'output' },
      ],
      inputs: [],
    });
    renderWidget();
    await waitFor(() => expect(screen.getByText('Helldivers 2')).toBeTruthy());
    fireEvent.click(screen.getByLabelText(PICK_OUTPUT));

    expect(screen.getByText('DELL U2415 (1)')).toBeTruthy();
    expect(screen.getByText('DELL U2415 (2)')).toBeTruthy();
    // A name that does not repeat keeps its plain label.
    expect(screen.getByText('Speakers')).toBeTruthy();
  });

  it('fits as many preset chips per page as their widths allow', async () => {
    // Six chips of 50px with a 6px gap need 386px; the stage has 300, so they
    // page - and the arrows then take 38px off each side, leaving 224.
    const names = ['One', 'Two', 'Three', 'Four', 'Five', 'Six'];
    stubChipWidths(Object.fromEntries(names.map(n => [n, 50])), 300);
    fetchAudioMixer.mockResolvedValue(state({
      presets: names.map((name, i) => ({
        id: `p${i}`, name, masterVolume: null, apps: [],
        outputDeviceId: '', outputDeviceName: '', inputDeviceId: '', inputDeviceName: '',
      })),
    }));
    renderWidget();
    await waitFor(() => expect(screen.getByText('One')).toBeTruthy());

    // 50 + 3x56 = 218 fits in 224; a fifth would need 274.
    expect(screen.getByText('Four')).toBeTruthy();
    expect(screen.queryByText('Five')).toBeNull();

    fireEvent.click(screen.getByLabelText(NEXT_PRESETS));
    expect(screen.getByText('Five')).toBeTruthy();
    expect(screen.getByText('Six')).toBeTruthy();
  });

  it('pages on measured width, not on a fixed chip count', async () => {
    // One wide chip plus one narrow one already overflows, where three narrow
    // ones would not - a count-based pager cannot tell those apart.
    stubChipWidths({ Streaming: 260, AFK: 40, Solo: 40 }, 300);
    fetchAudioMixer.mockResolvedValue(state({
      presets: ['Streaming', 'AFK', 'Solo'].map((name, i) => ({
        id: `p${i}`, name, masterVolume: null, apps: [],
        outputDeviceId: '', outputDeviceName: '', inputDeviceId: '', inputDeviceName: '',
      })),
    }));
    renderWidget();
    await waitFor(() => expect(screen.getByText('Streaming')).toBeTruthy());

    // 260 alone exceeds the 224 a paged row leaves, so it takes a page of its own.
    expect(screen.queryByText('AFK')).toBeNull();

    fireEvent.click(screen.getByLabelText(NEXT_PRESETS));
    expect(screen.getByText('AFK')).toBeTruthy();
    expect(screen.getByText('Solo')).toBeTruthy();
  });

  it('pages the same way inside a scaled panel', async () => {
    // y70 / phone / touch surfaces render widgets under transform: scale(), so
    // a hook mixing rect px with layout px pages a row that fits.
    const names = ['One', 'Two', 'Three', 'Four', 'Five', 'Six'];
    stubChipWidths(Object.fromEntries(names.map(n => [n, 50])), 300, 1.75);
    fetchAudioMixer.mockResolvedValue(state({
      presets: names.map((name, i) => ({
        id: `p${i}`, name, masterVolume: null, apps: [],
        outputDeviceId: '', outputDeviceName: '', inputDeviceId: '', inputDeviceName: '',
      })),
    }));
    renderWidget();
    await waitFor(() => expect(screen.getByText('One')).toBeTruthy());

    // Identical split to the unscaled case: 4 on page one, 2 on page two.
    expect(screen.getByText('Four')).toBeTruthy();
    expect(screen.queryByText('Five')).toBeNull();
    fireEvent.click(screen.getByLabelText(NEXT_PRESETS));
    expect(screen.getByText('Five')).toBeTruthy();
    expect(screen.getByText('Six')).toBeTruthy();
  });

  it('leaves the preset row unpaged when every chip fits', async () => {
    stubChipWidths({ AFK: 40, Solo: 40 }, 300);
    fetchAudioMixer.mockResolvedValue(state({
      presets: ['AFK', 'Solo'].map((name, i) => ({
        id: `p${i}`, name, masterVolume: null, apps: [],
        outputDeviceId: '', outputDeviceName: '', inputDeviceId: '', inputDeviceName: '',
      })),
    }));
    renderWidget();
    await waitFor(() => expect(screen.getByText('AFK')).toBeTruthy());

    expect(screen.getByText('Solo')).toBeTruthy();
    expect(screen.queryByLabelText(NEXT_PRESETS)).toBeNull();
  });

  it('stacks the output band above a fader row of master plus each app', async () => {
    renderWidget();
    await waitFor(() => expect(screen.getByText('Helldivers 2')).toBeTruthy());

    // The output selector is its own full-width band, not a cell in the row.
    const row = document.querySelector('[class*="sliderGrid"]')!;
    expect(row.querySelector('[aria-label="' + PICK_OUTPUT + '"]')).toBeNull();
    expect(row.children.length).toBe(3);
    expect(row.children[0].querySelector('[role="slider"]')?.getAttribute('aria-valuenow')).toBe('50');
    expect(screen.getByLabelText(PICK_OUTPUT)).toBeTruthy();
  });
});
