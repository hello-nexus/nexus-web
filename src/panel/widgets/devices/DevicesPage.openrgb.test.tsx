import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LightingDevice } from '../../../api/lighting';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../../components/common/Toast/Toast', () => ({ useToast: () => ({ push: vi.fn() }) }));
vi.mock('../../../hooks/useConflictApps', () => ({ useConflictApps: () => ({ conflicts: [], ready: true }) }));
vi.mock('../../../hooks/useUsbDevices', () => ({
  useUsbDevices: () => ({ devices: [], loading: false, refresh: vi.fn() }),
}));
vi.mock('../../../hooks/useUnifiedDevices', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../hooks/useUnifiedDevices')>()),
  useUnifiedDevices: () => ({ unified: [], controlDevice: vi.fn() }),
}));

const flags = { lighting: true };
vi.mock('../../../hooks/useUiSettings', () => ({
  useFeatureFlags: () => ({ lighting: flags.lighting, cooling: true, monitoring: true, diagnostics: true }),
}));

let cards: LightingDevice[] = [];
let rgbRunning = true;
const setControlled = vi.fn(() => Promise.resolve({}));
vi.mock('../../../api/lighting', () => ({
  fetchLightingDevices: () => Promise.resolve({ isInit: true, devices: cards }),
  fetchLightingStatus: () => Promise.resolve({ rgbRunning }),
  setLightingDeviceControlled: (...a: unknown[]) => setControlled(...(a as [])),
}));

import { DevicesPage } from './DevicesPage';

const card = (over: Partial<LightingDevice>) => ({ id: 'c', name: 'Board', ledsOn: true, ledCount: 1, ...over }) as LightingDevice;

function renderPage(onOpenLighting = vi.fn()) {
  render(<DevicesPage serviceOnline onDeviceSelect={vi.fn()} onOpenLighting={onOpenLighting} />);
  return onOpenLighting;
}

describe('DevicesPage OpenRGB section', () => {
  beforeEach(() => {
    flags.lighting = true;
    rgbRunning = true;
    cards = [];
    setControlled.mockClear();
  });

  it('lists one row per device and sets every card when toggled', async () => {
    cards = [card({ id: 'a1', deviceId: 'd', name: 'Board - H1' }), card({ id: 'a2', deviceId: 'd', name: 'Board - H2' })];
    renderPage();
    expect(await screen.findByText('Board')).toBeTruthy();
    expect(screen.queryByText('devices.openrgb.lightingOff')).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: 'devices.nexusControl' }));
    await vi.waitFor(() => expect(setControlled).toHaveBeenCalledTimes(2));
    expect(setControlled).toHaveBeenCalledWith('a1', false);
    expect(setControlled).toHaveBeenCalledWith('a2', false);
  });

  it('hides the section when lighting is on and nothing is detected', async () => {
    renderPage();
    await screen.findByText('devices.available.missingNotice');
    expect(screen.queryByText('devices.section.openrgb')).toBeNull();
  });

  it('shows the notice with a link to Lighting when the daemon is down', async () => {
    rgbRunning = false;
    const open = renderPage();
    expect(await screen.findByText('devices.openrgb.lightingOff')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'devices.openrgb.openLighting' }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(setControlled).not.toHaveBeenCalled();
  });

  it('shows the notice when the Lighting feature is off', async () => {
    flags.lighting = false;
    renderPage();
    expect(await screen.findByText('devices.openrgb.lightingOff')).toBeTruthy();
  });
});
