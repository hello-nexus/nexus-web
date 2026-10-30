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

describe('PanelControlCenter restricted (Restricted mode)', () => {
  it('shows every entry when not restricted', async () => {
    renderCenter(false);
    for (const label of SYSTEM_TILES) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getAllByLabelText('panel.controlCenter.brightness').length).toBeGreaterThan(0);
    expect(await screen.findByText('panel.controlCenter.wifi')).toBeTruthy();
  });

  it('shows only the Restricted mode indicator', async () => {
    vi.mocked(fetchRadios).mockClear();
    renderCenter(true);
    expect(screen.getByRole('status')).toHaveTextContent('devices.y70.restrictedMode');
    for (const label of SYSTEM_TILES) expect(screen.queryByText(label)).toBeNull();
    expect(screen.queryAllByLabelText('panel.controlCenter.brightness')).toHaveLength(0);
    expect(screen.queryAllByLabelText('panel.controlCenter.volume')).toHaveLength(0);
    expect(screen.queryAllByLabelText('panel.controlCenter.mic')).toHaveLength(0);
    expect(screen.queryByText('panel.controlCenter.mixer.title')).toBeNull();
    expect(screen.queryByLabelText('panel.controlCenter.media.playPause')).toBeNull();
    expect(fetchRadios).not.toHaveBeenCalled();
  });
});
