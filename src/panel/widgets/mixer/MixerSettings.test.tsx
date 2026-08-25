// t() is uninitialised under vitest and returns the raw key, so assertions use
// key strings for copy.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AudioMixerPreset } from '../../../api/mixer';
import { clampPresetName, presetNameTaken } from '../../../api/mixer';
import type { PanelWidget } from '../../types';
import { MixerSettings } from './MixerSettings';

const renamePreset = vi.fn();
const savePreset = vi.fn();
const applyPreset = vi.fn();
const refreshDevices = vi.fn();
let presets: AudioMixerPreset[] = [];

vi.mock('../../../hooks/useAudioMixer', () => ({
  useAudioMixer: () => ({
    supported: true,
    sessions: [],
    stickyLevels: true,
    presets,
    changeVolume: vi.fn(),
    commitVolume: vi.fn(),
    toggleMuted: vi.fn(),
    setSticky: vi.fn(),
    clearLevels: vi.fn(),
    savePreset: (...args: unknown[]) => { savePreset(...args); return Promise.resolve(); },
    renamePreset: (...args: unknown[]) => { renamePreset(...args); return Promise.resolve(); },
    deletePreset: vi.fn(),
    applyPreset: (...args: unknown[]) => { applyPreset(...args); return Promise.resolve(); },
  }),
}));

vi.mock('../../../hooks/useAudioDevices', () => ({
  useAudioDevices: () => ({
    outputs: [], inputs: [], activeOutput: null, activeInput: null,
    selectOutput: vi.fn(), selectInput: vi.fn(), refresh: refreshDevices,
  }),
}));

vi.mock('../../../hooks/useSystemVolume', () => ({
  useSystemVolume: () => ({
    state: { supported: true, volume: 0.5, muted: false },
    previewVolume: vi.fn(), commitVolume: vi.fn(), setMuted: vi.fn(),
  }),
}));

const SAVE = 'panel.widget.mixer.settings.saveCurrent';
const HINT_ALL = 'panel.widget.mixer.settings.saveHintAll';
const HINT_MASTER = 'panel.widget.mixer.settings.saveHintMaster';
const HINT_DEVICES = 'panel.widget.mixer.settings.saveHintDevices';
const HINT_APPS = 'panel.widget.mixer.settings.saveHintApps';
const INCLUDE_MASTER = 'panel.widget.mixer.settings.includeMaster';
const INCLUDE_DEVICES = 'panel.widget.mixer.settings.includeDevices';
const DUPLICATE = 'panel.widget.mixer.settings.duplicateName';

function makePreset(id: string, name: string): AudioMixerPreset {
  return {
    id, name, masterVolume: 0.5, apps: [],
    outputDeviceId: '', outputDeviceName: '', inputDeviceId: '', inputDeviceName: '',
  };
}

function renderSettings() {
  const widget: PanelWidget = { id: 'mixer-1', type: 'mixer', size: '4x4', col: 0, row: 0, config: {} };
  return render(
    <MixerSettings widget={widget} surface="desktop" desktopEditor onUpdate={vi.fn()} />,
  );
}

// SettingsRow renders its label as a div, not a <label for>, and t() collapses
// every row's rename label to the same key - so both fields are found by role.
function nameField(): HTMLElement {
  return screen.getByRole('textbox');
}

function openRename(name: string): HTMLElement {
  fireEvent.click(screen.getByText(name));
  const field = screen.getAllByLabelText('panel.widget.mixer.settings.renamePreset')
    .find(el => el.tagName === 'INPUT');
  if (!field) throw new Error('rename field did not open');
  return field;
}

beforeEach(() => {
  vi.clearAllMocks();
  presets = [makePreset('p1', 'Gaming')];
});

describe('preset name helpers', () => {
  it('clamps the way the service does, trailing space included', () => {
    // "Streaming solo" cut at ten leaves "Streaming ", which reads as a
    // different name than it compares as.
    expect(clampPresetName('  Gaming  ')).toBe('Gaming');
    expect(clampPresetName('Streaming solo')).toBe('Streaming');
  });

  it('treats case and post-clamp collisions as taken', () => {
    const list = [makePreset('p1', 'Gaming'), makePreset('p2', 'Streaming')];
    expect(presetNameTaken(list, 'gaming')).toBe(true);
    expect(presetNameTaken(list, 'Streaming duo')).toBe(true);
    expect(presetNameTaken(list, 'Chatting')).toBe(false);
  });

  it('does not count the preset being renamed as its own collision', () => {
    const list = [makePreset('p1', 'Gaming')];
    expect(presetNameTaken(list, 'Gaming', 'p1')).toBe(false);
    expect(presetNameTaken(list, 'Gaming', 'p2')).toBe(true);
  });
});

describe('MixerSettings capture hint', () => {
  // The hint has to name what the toggles will actually store, or it promises
  // a capture the save does not make.
  const toggle = (label: string) => fireEvent.click(screen.getByRole('switch', { name: label }));

  it('names the master and the endpoints while both are on', () => {
    renderSettings();
    expect(screen.getByText(HINT_ALL)).toBeTruthy();
  });

  it('drops the endpoints from the hint when they are excluded', () => {
    renderSettings();
    toggle(INCLUDE_DEVICES);
    expect(screen.getByText(HINT_MASTER)).toBeTruthy();
  });

  it('drops the master from the hint when it is excluded', () => {
    renderSettings();
    toggle(INCLUDE_MASTER);
    expect(screen.getByText(HINT_DEVICES)).toBeTruthy();
  });

  it('says app levels only once both are off', () => {
    renderSettings();
    toggle(INCLUDE_MASTER);
    toggle(INCLUDE_DEVICES);
    expect(screen.getByText(HINT_APPS)).toBeTruthy();
  });
});

describe('MixerSettings load', () => {
  it('re-reads the endpoints as soon as the apply resolves', async () => {
    // Applying can switch the output, and the header would otherwise sit on the
    // old device until the 5s device poll came round.
    presets = [{
      id: 'p1', name: 'Gaming', masterVolume: 0.9, apps: [],
      outputDeviceId: 'out-a', outputDeviceName: 'A', inputDeviceId: '', inputDeviceName: '',
    }];
    renderSettings();

    fireEvent.click(screen.getByText('panel.widget.mixer.settings.apply'));

    expect(applyPreset).toHaveBeenCalledWith('p1');
    await waitFor(() => expect(refreshDevices).toHaveBeenCalled());
  });
});

describe('MixerSettings row save', () => {
  const toggle = (label: string) => fireEvent.click(screen.getByRole('switch', { name: label }));

  it('captures endpoints even for a preset saved without them', () => {
    // Deriving the flags from the preset meant one stored before endpoints
    // existed could never gain them, which read as "save ignores the output".
    // Master differs from the live 0.5, so the row is not Active and offers Save.
    presets = [{
      id: 'p1', name: 'Gaming', masterVolume: 0.9, apps: [],
      outputDeviceId: '', outputDeviceName: '', inputDeviceId: '', inputDeviceName: '',
    }];
    renderSettings();

    fireEvent.click(screen.getByLabelText('panel.widget.mixer.settings.updatePresetAria'));

    expect(savePreset).toHaveBeenCalledWith({
      id: 'p1', name: 'Gaming', includeMaster: true, includeDevices: true,
    });
  });

  it('honours the preset options toggles', () => {
    presets = [{
      id: 'p1', name: 'Gaming', masterVolume: 0.5, apps: [],
      outputDeviceId: 'out-a', outputDeviceName: 'A', inputDeviceId: '', inputDeviceName: '',
    }];
    renderSettings();
    toggle('panel.widget.mixer.settings.includeDevices');

    fireEvent.click(screen.getByLabelText('panel.widget.mixer.settings.updatePresetAria'));

    expect(savePreset).toHaveBeenCalledWith({
      id: 'p1', name: 'Gaming', includeMaster: true, includeDevices: false,
    });
  });
});

describe('MixerSettings duplicate names', () => {
  it('refuses to save a name another preset already has', () => {
    renderSettings();
    fireEvent.change(nameField(), { target: { value: 'gaming' } });

    expect(screen.getByText(DUPLICATE)).toBeTruthy();
    expect(screen.getByText(SAVE).closest('button')).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByText(SAVE));
    expect(savePreset).not.toHaveBeenCalled();
  });

  it('saves once the name is unique', () => {
    renderSettings();
    fireEvent.change(nameField(), { target: { value: 'Chatting' } });

    expect(screen.queryByText(DUPLICATE)).toBeNull();
    fireEvent.click(screen.getByText(SAVE));
    expect(savePreset).toHaveBeenCalledWith({
      name: 'Chatting', includeMaster: true, includeDevices: true,
    });
  });

  it('refuses a rename onto another preset and says so', () => {
    presets = [makePreset('p1', 'Gaming'), makePreset('p2', 'Chatting')];
    renderSettings();

    const field = openRename('Chatting');
    fireEvent.change(field, { target: { value: 'Gaming' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(renamePreset).not.toHaveBeenCalled();
    expect(screen.getByText(DUPLICATE)).toBeTruthy();
  });

  it('allows a rename to a free name', () => {
    renderSettings();

    const field = openRename('Gaming');
    fireEvent.change(field, { target: { value: 'Chatting' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(renamePreset).toHaveBeenCalledWith('p1', 'Chatting');
  });
});
