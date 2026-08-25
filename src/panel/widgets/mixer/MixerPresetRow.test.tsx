// The active state is derived from whether the live mixer still matches the
// preset, not latched on the click - a latch would keep claiming the preset is
// active after a fader moved, and would miss a change made from another panel.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { AudioMixerPreset, AudioSession } from '../../../api/mixer';
import { MixerPresetRow } from './MixerPresetRow';

const LOAD = 'panel.widget.mixer.settings.apply';
const ACTIVE = 'panel.widget.mixer.settings.applied';
const SAVE = 'panel.widget.mixer.settings.updatePresetAria';

function preset(over: Partial<AudioMixerPreset> = {}): AudioMixerPreset {
  return {
    id: 'p1',
    name: 'Gaming',
    masterVolume: 0.6,
    outputDeviceId: 'out-a',
    outputDeviceName: 'Headset',
    inputDeviceId: '',
    inputDeviceName: '',
    apps: [{ id: 'game', name: 'Game', volume: 0.9, muted: false }],
    ...over,
  };
}

const session = (volume: number, muted = false): AudioSession =>
  ({ id: 'game', name: 'Game', volume, muted, peak: 0, active: true });

const onUpdate = vi.fn();

function renderRow(over: {
  preset?: AudioMixerPreset; sessions?: AudioSession[]; master?: number;
  output?: string; editable?: boolean;
} = {}) {
  return render(
    <MixerPresetRow
      preset={over.preset ?? preset()}
      sessions={over.sessions ?? [session(0.9)]}
      masterVolume={over.master ?? 0.6}
      outputDeviceId={over.output ?? 'out-a'}
      inputDeviceId="in-a"
      editable={over.editable ?? false}
      onApply={vi.fn()}
      onUpdate={onUpdate}
      onRename={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('MixerPresetRow save action', () => {
  it('writes the live mixer into the preset', () => {
    // Load reads a preset out; without this there is no way to write into one.
    renderRow({ editable: true, master: 0.2 });
    fireEvent.click(screen.getByLabelText(SAVE));
    expect(onUpdate).toHaveBeenCalled();
  });

  it('is hidden while the preset already matches', () => {
    renderRow({ editable: true });
    expect(screen.getByText(ACTIVE)).toBeTruthy();
    expect(screen.queryByLabelText(SAVE)).toBeNull();
  });

  it('is hidden on a surface with no keyboard, like apply-only phones', () => {
    renderRow({ editable: false, master: 0.2 });
    expect(screen.queryByLabelText(SAVE)).toBeNull();
  });
});

describe('MixerPresetRow active state', () => {
  it('reads as saved while the mixer matches the preset', () => {
    renderRow();
    expect(screen.getByText(ACTIVE)).toBeTruthy();
    expect(screen.getByText(ACTIVE).closest('button')).toHaveProperty('disabled', true);
  });

  it('returns to load once a level moves', () => {
    renderRow({ sessions: [session(0.4)] });
    expect(screen.getByText(LOAD)).toBeTruthy();
  });

  it('returns to load once the master moves', () => {
    renderRow({ master: 0.2 });
    expect(screen.getByText(LOAD)).toBeTruthy();
  });

  it('returns to load once the output device changes', () => {
    renderRow({ output: 'out-b' });
    expect(screen.getByText(LOAD)).toBeTruthy();
  });

  it('ignores an app the preset covers that is not running', () => {
    // Its level is restored when it next opens a session, so absence is not a
    // mismatch.
    renderRow({ sessions: [] });
    expect(screen.getByText(ACTIVE)).toBeTruthy();
  });

  it('ignores fields the preset chose not to capture', () => {
    renderRow({ preset: preset({ masterVolume: null, outputDeviceId: '' }), master: 0.1, output: 'out-z' });
    expect(screen.getByText(ACTIVE)).toBeTruthy();
  });
});
