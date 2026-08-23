import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LightingTouch } from './LightingTouch';
import { fetchAnimateSettings, setLightingDeviceColor, startStatic } from '../../../api/lighting';
import { DEVICE_PICKS_STORAGE_KEY, SELECTED_DEVICES_STORAGE_KEY } from './staticPicks';
import { defaultStateFor } from '../../../types/lighting';
import type { PanelWidget } from '../types';

// The immersive shell and its heavy leaves are not what this file is about:
// the subject is where a Static pick is routed, and against which preset slot.
vi.mock('./LightingWidget', () => ({ LightingWidget: () => <div /> }));
vi.mock('../common/ImmersiveLayout', () => ({
  ImmersiveLayout: ({ cells }: { cells: React.ReactNode[] }) => <div>{cells}</div>,
}));
vi.mock('./page/EffectControls', () => ({ EffectControls: () => <div /> }));
vi.mock('./page/StaticPalette', () => ({ StaticPalette: () => <div /> }));
vi.mock('./effecteditor/MediaList', () => ({ MediaList: () => <div /> }));
vi.mock('./effecteditor/PostProcessControls', () => ({ PostProcessControls: () => <div /> }));
vi.mock('./page/ModeControls', () => ({ ScreenControls: () => <div /> }));
vi.mock('./page/AnimateGrid', () => ({
  AnimateGrid: ({ onSelect }: { onSelect: (key: string) => void }) => (
    <button type="button" onClick={() => onSelect('stripes')}>pick-stripes</button>
  ),
}));
vi.mock('./effecteditor/StaticDeviceSelect', () => ({
  StaticDeviceSelect: () => <div data-testid="device-select" />,
}));

vi.mock('../../../api/lighting', () => ({
  fetchAnimateDefaults: vi.fn(() => Promise.resolve(null)),
  fetchAnimateSettings: vi.fn(() => Promise.resolve({ effect: 'rainbow', templates: {} })),
  fetchCurrentSync: vi.fn(() => Promise.resolve({ sync: 'static' })),
  fetchStaticSettings: vi.fn(() => Promise.resolve({ effect: 'gradientlinear', states: {} })),
  fetchMediaEffect: vi.fn(() => Promise.resolve(null)),
  fetchScreenEffect: vi.fn(() => Promise.resolve(null)),
  fetchLightingDevices: vi.fn(() => Promise.resolve({ devices: [] })),
  saveAnimateTemplates: vi.fn(() => Promise.resolve()),
  setMediaEffect: vi.fn(() => Promise.resolve()),
  setScreenEffect: vi.fn(() => Promise.resolve()),
  setLightingDeviceColor: vi.fn(() => Promise.resolve()),
  startAnimate: vi.fn(() => Promise.resolve()),
  startStatic: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../../hooks/useMultiplexSocket', () => ({ useTopicCallback: vi.fn() }));
vi.mock('../../../lib/controlSync', () => ({ subscribeControlSync: vi.fn(() => () => {}) }));
vi.mock('../../../hooks/usePanelBackgroundUsage', () => ({
  usePanelBackgroundUsage: () => ({ effects: new Set(), slotsByEffect: new Map() }),
}));
vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key, language: 'en' }),
}));

const widget: PanelWidget = { id: 'w', type: 'lighting', size: '4x4', col: 0, row: 0 };

describe('LightingTouch static picks', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(setLightingDeviceColor).mockClear();
    vi.mocked(startStatic).mockClear();
  });

  it('routes a Static pick to the selected devices, never the global effect', async () => {
    localStorage.setItem(SELECTED_DEVICES_STORAGE_KEY, JSON.stringify(['dev-a', 'dev-b']));
    render(<LightingTouch widget={widget} />);

    fireEvent.click(await screen.findByText('pick-stripes'));

    await waitFor(() => expect(setLightingDeviceColor).toHaveBeenCalledTimes(2));
    expect(vi.mocked(setLightingDeviceColor).mock.calls.map(c => c[0]).sort())
      .toEqual(['dev-a', 'dev-b']);
    // A global start would repaint every device that carries its own assignment.
    expect(startStatic).not.toHaveBeenCalled();
  });

  // A pick stores the slot it was made against; devices hold references to
  // shared presets, so recording slot 0 for a look taken from another slot
  // points the page's card strip and dock at the wrong preset.
  it('records the pick against the preset slot it came from', async () => {
    const slots = [0, 1, 2, 3].map(() => defaultStateFor('stripes'));
    vi.mocked(fetchAnimateSettings).mockResolvedValueOnce({
      effect: 'rainbow',
      states: {},
      templates: { stripes: { selected: 2, slots } },
    });
    localStorage.setItem(SELECTED_DEVICES_STORAGE_KEY, JSON.stringify(['dev-a']));
    render(<LightingTouch widget={widget} />);

    fireEvent.click(await screen.findByText('pick-stripes'));

    await waitFor(() => expect(setLightingDeviceColor).toHaveBeenCalled());
    const picks = JSON.parse(localStorage.getItem(DEVICE_PICKS_STORAGE_KEY) ?? '{}');
    expect(picks['dev-a']).toMatchObject({ key: 'stripes', slot: 2 });
  });

  it('writes nothing while no device is selected', async () => {
    render(<LightingTouch widget={widget} />);

    fireEvent.click(await screen.findByText('pick-stripes'));

    await waitFor(() => expect(screen.getByText('pick-stripes')).toBeInTheDocument());
    expect(setLightingDeviceColor).not.toHaveBeenCalled();
    expect(startStatic).not.toHaveBeenCalled();
  });
});
