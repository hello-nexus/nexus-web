import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LightingOnboardingScreen } from './LightingOnboardingScreen';
import {
  fetchLightingDevices,
  fetchLightingStatus,
  setLightingDeviceColor,
  setLightingDeviceControlled,
  startAnimate,
  startStatic,
  type LightingDevice,
} from '../../../api/lighting';
import { paletteColor } from '../../../types/lightingPalette';
import { completeLightingOnboarding } from '../../../api/onboarding';
import { useConflictApps } from '../../../hooks/useConflictApps';

vi.mock('../../../api/lighting', () => ({
  fetchLightingDevices: vi.fn(),
  fetchLightingStatus: vi.fn(),
  setLightingDeviceControlled: vi.fn(),
  // ZoneCard's identify affordance; unused in toggleMode but imported.
  identifyLightingDevice: vi.fn(),
  startAnimate: vi.fn(),
  startStatic: vi.fn(),
  setLightingDeviceColor: vi.fn(),
}));

// The strip paints on a canvas, which jsdom does not implement; echoing the
// pick is how this suite can see the colour reach the card.
vi.mock('../../../panel/widgets/lighting/page/DeviceLedStrip', () => ({
  DeviceLedStrip: ({ pick }: { pick?: { hex: string } }) => (
    <div data-testid="led-strip" data-hex={pick?.hex ?? ''} />
  ),
}));

vi.mock('../../../api/onboarding', () => ({
  completeLightingOnboarding: vi.fn(),
}));

vi.mock('../../../hooks/useConflictApps', () => ({
  useConflictApps: vi.fn(),
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const strip: LightingDevice = {
  id: 'openrgb-0',
  name: 'Test Strip',
  ledsOn: true,
  ledCount: 10,
  canvasX: 0,
  canvasY: 0,
  canvasW: 1,
  canvasH: 1,
  canvasRotation: 0,
};

const hub: LightingDevice = { ...strip, id: 'openrgb-1', name: 'Test Hub', controlled: false };

function seed(devices: LightingDevice[], scanning = false, isInit = true, rgbRunning = true) {
  vi.mocked(fetchLightingDevices).mockResolvedValue({ isInit, devices });
  vi.mocked(fetchLightingStatus).mockResolvedValue({ gpuAvailable: true, scanning, rgbRunning });
}

function renderScreen(onComplete = vi.fn()) {
  render(<LightingOnboardingScreen open onComplete={onComplete} />);
  return onComplete;
}

/** Device picking lives in Advanced; the screen opens on Simple. */
function chooseAdvanced() {
  fireEvent.click(screen.getByRole('radio', { name: /lightingOnboarding\.mode\.advanced/ }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useConflictApps).mockReturnValue({ conflicts: [], ready: true });
  vi.mocked(setLightingDeviceControlled).mockResolvedValue(null);
  vi.mocked(setLightingDeviceColor).mockResolvedValue(null as never);
});

describe('LightingOnboardingScreen - device grid', () => {
  it('renders one whole-card switch per device, checked for controlled and unchecked for ignored', async () => {
    seed([strip, hub]);
    renderScreen();

    // Simple shows every device as driven whatever its stored state; only
    // advanced reads each one back the way the user left it.
    const stripCard = await screen.findByRole('switch', { name: 'Test Strip' });
    expect(stripCard).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'Test Hub' })).toHaveAttribute('aria-checked', 'true');

    chooseAdvanced();
    expect(screen.getByRole('switch', { name: 'Test Strip' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'Test Hub' })).toHaveAttribute('aria-checked', 'false');
  });

  it('Enter on a focused card toggles it without firing the Overlay Continue handler', async () => {
    seed([strip]);
    vi.mocked(completeLightingOnboarding).mockResolvedValue({ completed: true, lightingCompleted: true });
    const onComplete = renderScreen();

    chooseAdvanced();
    const card = await screen.findByRole('switch', { name: 'Test Strip' });
    fireEvent.keyDown(card, { key: 'Enter' });

    expect(setLightingDeviceControlled).toHaveBeenCalledWith('openrgb-0', false);
    expect(completeLightingOnboarding).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('clicking a controlled card ignores it, clicking an ignored card restores it', async () => {
    seed([strip, hub]);
    renderScreen();

    chooseAdvanced();
    fireEvent.click(await screen.findByRole('switch', { name: 'Test Strip' }));
    expect(setLightingDeviceControlled).toHaveBeenCalledWith('openrgb-0', false);
    // Optimistic flip, before any refetch.
    expect(screen.getByRole('switch', { name: 'Test Strip' })).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(screen.getByRole('switch', { name: 'Test Hub' }));
    expect(setLightingDeviceControlled).toHaveBeenCalledWith('openrgb-1', true);
    expect(screen.getByRole('switch', { name: 'Test Hub' })).toHaveAttribute('aria-checked', 'true');
  });

  it('select none ignores every controlled device; select all restores every ignored one', async () => {
    seed([strip, hub]);
    renderScreen();
    chooseAdvanced();
    await screen.findByRole('switch', { name: 'Test Strip' });

    // Mixed selection: both bulk actions available.
    expect(screen.getByRole('button', { name: 'lighting.ledMap.selectAll' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'lightingOnboarding.selectNone' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'lightingOnboarding.selectNone' }));
    expect(setLightingDeviceControlled).toHaveBeenCalledWith('openrgb-0', false);
    // Already-ignored devices are not re-posted.
    expect(setLightingDeviceControlled).not.toHaveBeenCalledWith('openrgb-1', false);
    expect(screen.getByRole('switch', { name: 'Test Strip' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('button', { name: 'lightingOnboarding.selectNone' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'lighting.ledMap.selectAll' }));
    expect(setLightingDeviceControlled).toHaveBeenCalledWith('openrgb-0', true);
    expect(setLightingDeviceControlled).toHaveBeenCalledWith('openrgb-1', true);
    expect(screen.getByRole('switch', { name: 'Test Strip' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'Test Hub' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: 'lighting.ledMap.selectAll' })).toBeDisabled();
  });

  it('disables select all while everything is already selected', async () => {
    seed([strip]);
    renderScreen();
    chooseAdvanced();
    await screen.findByRole('switch', { name: 'Test Strip' });
    expect(screen.getByRole('button', { name: 'lighting.ledMap.selectAll' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'lightingOnboarding.selectNone' })).toBeEnabled();
  });

  it('hides the bulk actions while no devices are listed', async () => {
    seed([], false);
    renderScreen();
    await screen.findByText('lighting.devices.empty');
    expect(screen.queryByRole('button', { name: 'lightingOnboarding.selectNone' })).toBeNull();
  });

  it('holds poll application while a controlled write is in flight, so stale state cannot revert the flip', async () => {
    vi.useFakeTimers();
    try {
      seed([strip], true);
      let resolveWrite!: (v: null) => void;
      vi.mocked(setLightingDeviceControlled).mockReturnValue(new Promise<null>(r => { resolveWrite = r; }) as never);
      render(<LightingOnboardingScreen open onComplete={vi.fn()} />);
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });

      chooseAdvanced();
      fireEvent.click(screen.getByRole('switch', { name: 'Test Strip' }));
      expect(screen.getByRole('switch', { name: 'Test Strip' })).toHaveAttribute('aria-checked', 'false');

      // A full poll tick serves the pre-write list while the POST is still
      // in flight; the pending-write guard must discard it.
      await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
      expect(screen.getByRole('switch', { name: 'Test Strip' })).toHaveAttribute('aria-checked', 'false');

      // Once the write settles, polls apply again - proven by a payload
      // field the optimistic flip could not have produced (the rename).
      seed([{ ...strip, name: 'Test Strip Committed', controlled: false }], true);
      await act(async () => { resolveWrite(null); });
      await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
      const resumed = screen.getByRole('switch', { name: 'Test Strip Committed' });
      expect(resumed).toHaveAttribute('aria-checked', 'false');
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the scanning note while a scan is in flight with devices already listed', async () => {
    seed([strip], true);
    renderScreen();

    chooseAdvanced();
    await screen.findByRole('switch', { name: 'Test Strip' });
    expect(screen.getByText('lightingOnboarding.scanning')).toBeInTheDocument();
  });

  it('shows a scanning empty state before any device arrives, and the empty state once the scan settles', async () => {
    seed([], true);
    const { unmount } = render(<LightingOnboardingScreen open onComplete={vi.fn()} />);
    expect(await screen.findByText('lightingOnboarding.scanning')).toBeInTheDocument();
    expect(screen.queryByText('lighting.devices.empty')).not.toBeInTheDocument();
    unmount();

    seed([], false);
    render(<LightingOnboardingScreen open onComplete={vi.fn()} />);
    expect(await screen.findByText('lighting.devices.empty')).toBeInTheDocument();
  });

  it('treats a booting bridge as scanning, but a stopped bridge as the real empty state', async () => {
    seed([], false, false, true);
    const { unmount } = render(<LightingOnboardingScreen open onComplete={vi.fn()} />);
    expect(await screen.findByText('lightingOnboarding.scanning')).toBeInTheDocument();
    unmount();

    seed([], false, false, false);
    render(<LightingOnboardingScreen open onComplete={vi.fn()} />);
    expect(await screen.findByText('lighting.devices.empty')).toBeInTheDocument();
  });
});


describe('LightingOnboardingScreen - continue flow', () => {
  it('calls onComplete once the completion write reports lightingCompleted:true', async () => {
    seed([strip]);
    vi.mocked(completeLightingOnboarding).mockResolvedValue({ completed: true, lightingCompleted: true });
    const onComplete = renderScreen();

    chooseAdvanced();
    await screen.findByRole('switch', { name: 'Test Strip' });
    fireEvent.click(screen.getByRole('button', { name: 'onboarding.finish' }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(completeLightingOnboarding).toHaveBeenCalled();
  });

  it('shows the error message and never calls onComplete when the write fails', async () => {
    seed([strip]);
    vi.mocked(completeLightingOnboarding).mockResolvedValue(null);
    const onComplete = renderScreen();

    chooseAdvanced();
    await screen.findByRole('switch', { name: 'Test Strip' });
    fireEvent.click(screen.getByRole('button', { name: 'onboarding.finish' }));

    expect(await screen.findByText('welcome.error')).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('shows the change-any-time hint', async () => {
    seed([strip]);
    renderScreen();

    expect(await screen.findByText('lightingOnboarding.hint')).toBeInTheDocument();
  });

  it('renders a Back button only when onBack is provided, and clicking it steps back', async () => {
    seed([strip]);
    const onBack = vi.fn();
    const { unmount } = render(<LightingOnboardingScreen open onComplete={vi.fn()} onBack={onBack} />);
    chooseAdvanced();
    await screen.findByRole('switch', { name: 'Test Strip' });

    fireEvent.click(screen.getByRole('button', { name: 'nav.back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(completeLightingOnboarding).not.toHaveBeenCalled();
    unmount();

    render(<LightingOnboardingScreen open onComplete={vi.fn()} />);
    chooseAdvanced();
    await screen.findByRole('switch', { name: 'Test Strip' });
    expect(screen.queryByRole('button', { name: 'nav.back' })).toBeNull();
  });
});

describe('LightingOnboardingScreen colour test strip', () => {
  it('opens on the rainbow, which a fresh install already runs, and starts nothing', async () => {
    seed([strip]);
    renderScreen();
    await screen.findByRole('switch', { name: 'Test Strip' });

    const swatches = screen.getByRole('group', { name: 'lightingOnboarding.testColors' }).querySelectorAll('button');
    expect(swatches[0]).toHaveAccessibleName('lighting.simple.anim.rainbow');
    expect(swatches[0]).toHaveAttribute('aria-pressed', 'true');
    expect(startAnimate).not.toHaveBeenCalled();
    expect(startStatic).not.toHaveBeenCalled();
  });

  it('keeps a picked colour the way the simple palette does: Static, then a pick per device', async () => {
    seed([strip, hub]);
    renderScreen();
    await screen.findByRole('switch', { name: 'Test Strip' });

    const red = screen.getByRole('button', { name: 'lighting.controls.simplered' });
    fireEvent.click(red);

    const color = paletteColor('red-3')!;
    await waitFor(() => expect(setLightingDeviceColor).toHaveBeenCalledTimes(2));
    // Saved, not previewed: no persist=false.
    expect(vi.mocked(startStatic).mock.calls[0]).toEqual(['gradientlinear']);
    // Simple drives every device, including the one stored as ignored.
    for (const id of ['openrgb-0', 'openrgb-1']) {
      expect(setLightingDeviceColor).toHaveBeenCalledWith(id, color.h, color.s, expect.objectContaining({ effect: 'flat', color: color.hex }));
    }
    expect(red).toHaveAttribute('aria-pressed', 'true');
  });

  it('colours only the driven devices in advanced', async () => {
    seed([strip, hub]);
    renderScreen();
    chooseAdvanced();
    await screen.findByRole('switch', { name: 'Test Strip' });

    fireEvent.click(screen.getByRole('button', { name: 'lighting.controls.simplered' }));

    await waitFor(() => expect(setLightingDeviceColor).toHaveBeenCalledTimes(1));
    expect(vi.mocked(setLightingDeviceColor).mock.calls[0][0]).toBe('openrgb-0');
  });

  it('goes back to the simple rainbow when its dot is pressed again', async () => {
    seed([strip]);
    renderScreen();
    await screen.findByRole('switch', { name: 'Test Strip' });

    fireEvent.click(screen.getByRole('button', { name: 'lighting.controls.simpleblue' }));
    const rainbow = screen.getByRole('button', { name: 'lighting.simple.anim.rainbow' });
    fireEvent.click(rainbow);

    await waitFor(() => expect(startAnimate).toHaveBeenCalledTimes(1));
    expect(vi.mocked(startAnimate).mock.calls[0].slice(0, 2)).toEqual(['sweeprainbow', 50]);
    expect(rainbow).toHaveAttribute('aria-pressed', 'true');
  });

  it('runs only the latest of several quick picks', async () => {
    seed([strip]);
    renderScreen();
    await screen.findByRole('switch', { name: 'Test Strip' });

    fireEvent.click(screen.getByRole('button', { name: 'lighting.controls.simplered' }));
    fireEvent.click(screen.getByRole('button', { name: 'lighting.controls.simpleblue' }));
    fireEvent.click(screen.getByRole('button', { name: 'lighting.simple.anim.rainbow' }));

    await waitFor(() => expect(startAnimate).toHaveBeenCalledTimes(1));
    // The superseded colours never reach the lights, so none can land late.
    expect(startStatic).not.toHaveBeenCalled();
    expect(setLightingDeviceColor).not.toHaveBeenCalled();
  });

  it('re-applies the colour on Finish, so a device found after the pick wears it too', async () => {
    seed([strip]);
    vi.mocked(completeLightingOnboarding).mockResolvedValue({ completed: true, lightingCompleted: true });
    const onComplete = renderScreen();
    await screen.findByRole('switch', { name: 'Test Strip' });

    fireEvent.click(screen.getByRole('button', { name: 'lighting.controls.simplered' }));
    await waitFor(() => expect(setLightingDeviceColor).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'onboarding.finish' }));

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(setLightingDeviceColor).toHaveBeenCalledTimes(2);
  });

  it('keeps the scanning note and the strip out of the device scroller', async () => {
    seed([strip], true);
    renderScreen();
    chooseAdvanced();
    await screen.findByRole('switch', { name: 'Test Strip' });

    // Anything that appears and disappears inside the scroller resizes it on
    // every poll, which is what made it flicker.
    const scroller = document.querySelector('[class*=deviceArea]');
    expect(scroller).not.toBeNull();
    expect(scroller!.querySelector('[class*=scanningNote]')).toBeNull();
    expect(scroller!.querySelector('[class*=testStrip]')).toBeNull();
    // Both still render, just outside it.
    expect(document.querySelector('[class*=scanningNote]')).not.toBeNull();
    expect(document.querySelector('[class*=testStrip]')).not.toBeNull();
  });

  it('paints the picked colour into each device card, not around it', async () => {
    seed([strip]);
    renderScreen();
    chooseAdvanced();
    await screen.findByRole('switch', { name: 'Test Strip' });
    expect(screen.getAllByTestId('led-strip')[0]).toHaveAttribute('data-hex', '');

    fireEvent.click(screen.getByRole('button', { name: 'lighting.controls.simplered' }));

    await waitFor(() => expect(screen.getAllByTestId('led-strip')[0]).toHaveAttribute('data-hex', paletteColor('red-3')!.hex));
  });

  it('stops polling once a scan has settled with devices', async () => {
    vi.useFakeTimers();
    try {
      seed([strip]);
      render(<LightingOnboardingScreen open onComplete={vi.fn()} />);
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      const settledCalls = vi.mocked(fetchLightingDevices).mock.calls.length;

      await act(async () => { await vi.advanceTimersByTimeAsync(10000); });

      // Left running, the poll keeps rebuilding the list under the user.
      expect(vi.mocked(fetchLightingDevices).mock.calls.length).toBe(settledCalls);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps polling while a scan is still running', async () => {
    vi.useFakeTimers();
    try {
      seed([strip], true);
      render(<LightingOnboardingScreen open onComplete={vi.fn()} />);
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      const before = vi.mocked(fetchLightingDevices).mock.calls.length;

      await act(async () => { await vi.advanceTimersByTimeAsync(6000); });

      expect(vi.mocked(fetchLightingDevices).mock.calls.length).toBeGreaterThan(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a flip that a pre-write poll answers with the old value', async () => {
    vi.useFakeTimers();
    try {
      // Scanning, so polling is still live while the user clicks.
      seed([strip], true);
      render(<LightingOnboardingScreen open onComplete={vi.fn()} />);
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });

      chooseAdvanced();
      fireEvent.click(screen.getByRole('switch', { name: 'Test Strip' }));
      expect(screen.getByRole('switch', { name: 'Test Strip' })).toHaveAttribute('aria-checked', 'false');

      // Every later poll still answers `controlled: true` - the service has
      // not caught up. The card must not flip back on its own.
      for (let i = 0; i < 3; i++) {
        await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
        expect(screen.getByRole('switch', { name: 'Test Strip' })).toHaveAttribute('aria-checked', 'false');
      }

      // Once the service agrees, the poll is authoritative again.
      seed([{ ...strip, controlled: false }], true);
      await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
      expect(screen.getByRole('switch', { name: 'Test Strip' })).toHaveAttribute('aria-checked', 'false');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('LightingOnboardingScreen mode choice', () => {
  beforeEach(() => {
    vi.mocked(completeLightingOnboarding).mockResolvedValue({ lightingCompleted: true } as never);
  });

  it('opens on Simple, where there is nothing to pick', async () => {
    seed([strip]);
    renderScreen();
    await screen.findByRole('radio', { name: /lightingOnboarding\.mode\.simple/ });
    expect(screen.getByRole('radio', { name: /lightingOnboarding\.mode\.simple/ })).toHaveAttribute('aria-checked', 'true');
    // The bulk actions stay on the screen, with nothing to act on. The mode
    // radios render before the device list lands.
    expect(await screen.findByRole('button', { name: 'lighting.ledMap.selectAll' })).toBeDisabled();
  });

  it('Simple drives every device, putting back any the user had switched off', async () => {
    seed([{ ...strip, controlled: false }]);
    const onComplete = renderScreen();
    // Continue reads the device list, which lands after the mode radios.
    await screen.findByRole('switch', { name: 'Test Strip' });

    fireEvent.click(screen.getByRole('button', { name: 'onboarding.finish' }));

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(setLightingDeviceControlled).toHaveBeenCalledWith('openrgb-0', true);
  });

  it('offers only Simple and Advanced', async () => {
    seed([strip]);
    renderScreen();
    await screen.findByRole('radio', { name: /lightingOnboarding\.mode\.simple/ });

    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.queryByRole('radio', { name: /lightingOnboarding\.mode\.off/ })).not.toBeInTheDocument();
  });

  it('keeps the bulk actions visible in every mode, live only in Advanced', async () => {
    seed([strip, hub]);
    renderScreen();
    await screen.findByRole('switch', { name: 'Test Strip' });

    // Simple: present, but there is nothing for them to choose between.
    expect(screen.getByRole('button', { name: 'lighting.ledMap.selectAll' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'lightingOnboarding.selectNone' })).toBeDisabled();

    chooseAdvanced();
    // One device is ignored, so both actions have work to do.
    expect(screen.getByRole('button', { name: 'lighting.ledMap.selectAll' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'lightingOnboarding.selectNone' })).toBeEnabled();
  });
});
