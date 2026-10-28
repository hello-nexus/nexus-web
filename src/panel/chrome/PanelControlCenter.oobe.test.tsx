import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../hooks/usePanelBrightness', () => ({
  usePanelBrightness: vi.fn(() => ({ available: true, value: 50, linkDown: false, preview: vi.fn(), commit: vi.fn() })),
  brightnessTargetFor: () => 'target',
}));
vi.mock('../../hooks/useSystemVolume', () => ({
  useSystemVolume: () => ({ state: { supported: true, volume: 0.5, muted: false }, commitVolume: vi.fn(), setMuted: vi.fn() }),
}));
vi.mock('../../hooks/useSystemMic', () => ({
  useSystemMic: () => ({ state: { supported: true, volume: 0.5, muted: false }, previewVolume: vi.fn(), commitVolume: vi.fn(), setMuted: vi.fn() }),
}));
const session = {
  song: { title: 'Song', artist: 'Artist' },
  playback: { playing: true, stopped: false },
};
vi.mock('../../hooks/useMedia', () => ({
  useMedia: () => ({ sessions: { a: session } }),
  controlActiveMedia: vi.fn(),
}));
vi.mock('../../api/radios', () => ({
  fetchRadios: vi.fn(async () => ({ wifi: { on: true }, bluetooth: { on: true }, airplane: { on: false } })),
  setRadio: vi.fn(),
}));
vi.mock('../../api/system', () => ({ systemPower: vi.fn() }));
vi.mock('../../hooks/useUiSettings', () => ({ useUnitPrefs: () => ({ timeFormat: '24h' }) }));
vi.mock('./ControlCenterMixerView', () => ({ ControlCenterMixerView: () => null }));

import { usePanelBrightness } from '../../hooks/usePanelBrightness';
import { fetchRadios } from '../../api/radios';
import { PanelControlCenter } from './PanelControlCenter';

function renderCenter(restricted: boolean) {
  return render(
    <PanelControlCenter
      open
      onOpen={vi.fn()}
      onClose={vi.fn()}
      surface="y70"
      kioskBehavior
      surfaceRef={{ current: null }}
      isLandscape
      resolvedThemeMode="dark"
      onSetThemeMode={vi.fn()}
      onScreenSleep={vi.fn()}
      sheetOpen={false}
      trayOpen={false}
      offline={false}
      rearranging={false}
      dragArmed={false}
      asleep={false}
      restricted={restricted}
    />,
  );
}

const SYSTEM_TILES = [
  'panel.controlCenter.darkMode',
  'panel.controlCenter.lockPc',
  'panel.controlCenter.sleepPc',
  'panel.controlCenter.screenSleep',
];

describe('PanelControlCenter restricted (Windows OOBE)', () => {
  it('shows every entry when not restricted', async () => {
    renderCenter(false);
    for (const label of SYSTEM_TILES) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getAllByLabelText('panel.controlCenter.brightness').length).toBeGreaterThan(0);
    expect(await screen.findByText('panel.controlCenter.wifi')).toBeTruthy();
  });

  it('keeps only volume, mic, mixer and media', async () => {
    vi.mocked(fetchRadios).mockClear();
    renderCenter(true);
    for (const label of SYSTEM_TILES) expect(screen.queryByText(label)).toBeNull();
    expect(screen.queryAllByLabelText('panel.controlCenter.brightness')).toHaveLength(0);
    expect(screen.queryByText('panel.controlCenter.wifi')).toBeNull();
    expect(screen.queryByText('panel.controlCenter.bluetooth')).toBeNull();
    expect(screen.queryByText('panel.controlCenter.airplane')).toBeNull();
    expect(screen.getAllByLabelText('panel.controlCenter.volume').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('panel.controlCenter.mic').length).toBeGreaterThan(0);
    expect(screen.getByText('panel.controlCenter.mixer.title')).toBeTruthy();
    expect(screen.getByLabelText('panel.controlCenter.media.playPause')).toBeTruthy();
    expect(fetchRadios).not.toHaveBeenCalled();
    expect(vi.mocked(usePanelBrightness).mock.calls.at(-1)?.[0]).toBe(false);
  });
});
