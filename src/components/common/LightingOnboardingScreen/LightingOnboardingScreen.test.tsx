import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LightingOnboardingScreen } from './LightingOnboardingScreen';
import {
  fetchLightingDevices,
  fetchLightingStatus,
  setLightingDeviceControlled,
  startStatic,
  stopLighting,
  cachedAnimateDefaults,
  type LightingDevice,
} from '../../../api/lighting';
import { completeLightingOnboarding } from '../../../api/onboarding';
import { useConflictApps } from '../../../hooks/useConflictApps';

vi.mock('../../../api/lighting', () => ({
  fetchLightingDevices: vi.fn(),
  fetchLightingStatus: vi.fn(),
  setLightingDeviceControlled: vi.fn(),
  stopLighting: vi.fn(),
  // ZoneCard's identify affordance; unused in toggleMode but imported.
  identifyLightingDevice: vi.fn(),
  startStatic: vi.fn(),
  fetchAnimateDefaults: vi.fn(),
  cachedAnimateDefaults: vi.fn(),
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
  vi.mocked(stopLighting).mockResolvedValue(null);
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

describe('LightingOnboardingScreen - conflicts', () => {
  it('lists detected conflicting apps', async () => {
    seed([strip]);
    vi.mocked(useConflictApps).mockReturnValue({
      conflicts: [{ id: 'icue', displayName: 'Corsair iCUE', category: 'lighting', processName: 'iCUE.exe', pid: 4242 }],
      ready: true,
    });
    renderScreen();

    expect(await screen.findByText('Corsair iCUE')).toBeInTheDocument();
    expect(screen.getByText('conflicts.modal.intro')).toBeInTheDocument();
  });

  it('excludes HYTE Nexus 2 from the strip - its shutdown offer lives in the dedicated gate', async () => {
    seed([strip]);
    vi.mocked(useConflictApps).mockReturnValue({
      conflicts: [
        { id: 'hyte-nexus-2', displayName: 'HYTE Nexus 2', category: 'lighting', processName: 'HYTE Nexus.exe', pid: 111 },
        { id: 'icue', displayName: 'Corsair iCUE', category: 'lighting', processName: 'iCUE.exe', pid: 4242 },
      ],
      ready: true,
    });
    renderScreen();

    expect(await screen.findByText('Corsair iCUE')).toBeInTheDocument();
    expect(screen.queryByText('HYTE Nexus 2')).not.toBeInTheDocument();
  });

  it('renders no conflict section when only HYTE Nexus 2 is detected', async () => {
    seed([strip]);
    vi.mocked(useConflictApps).mockReturnValue({
      conflicts: [
        { id: 'hyte-nexus-2', displayName: 'HYTE Nexus 2', category: 'lighting', processName: 'HYTE Nexus.exe', pid: 111 },
      ],
      ready: true,
    });
    renderScreen();

    chooseAdvanced();
    await screen.findByRole('switch', { name: 'Test Strip' });
    expect(screen.queryByText('conflicts.modal.intro')).not.toBeInTheDocument();
  });

  it('renders no conflict section when none are detected', async () => {
    seed([strip]);
    renderScreen();

    chooseAdvanced();
    await screen.findByRole('switch', { name: 'Test Strip' });
    expect(screen.queryByText('conflicts.modal.intro')).not.toBeInTheDocument();
  });
});

describe('LightingOnboardingScreen - continue flow', () => {
  it('calls onComplete once the completion write reports lightingCompleted:true', async () => {
    seed([strip]);
    vi.mocked(completeLightingOnboarding).mockResolvedValue({ completed: true, lightingCompleted: true });
    const onComplete = renderScreen();

    chooseAdvanced();
    await screen.findByRole('switch', { name: 'Test Strip' });
    fireEvent.click(screen.getByRole('button', { name: 'lightingOnboarding.continue' }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(completeLightingOnboarding).toHaveBeenCalled();
  });

  it('shows the error message and never calls onComplete when the write fails', async () => {
    seed([strip]);
    vi.mocked(completeLightingOnboarding).mockResolvedValue(null);
    const onComplete = renderScreen();

    chooseAdvanced();
    await screen.findByRole('switch', { name: 'Test Strip' });
    fireEvent.click(screen.getByRole('button', { name: 'lightingOnboarding.continue' }));

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
  it('offers a swatch per test fill, and running one does not persist it', async () => {
    seed([strip]);
    renderScreen();
    chooseAdvanced();
    await screen.findByRole('switch', { name: 'Test Strip' });

    const red = screen.getByRole('button', { name: 'lighting.controls.simplered' });
    fireEvent.click(red);

    await waitFor(() => expect(startStatic).toHaveBeenCalledTimes(1));
    const call = vi.mocked(startStatic).mock.calls[0];
    expect(call[0]).toBe('simplered');
    // Last argument is `persist`: a test look must not overwrite the saved one.
    expect(call[7]).toBe(false);
    expect(red).toHaveAttribute('aria-pressed', 'true');
  });

  it('sends each fill its own colour, so a second pick actually changes', async () => {
    // The fills share one parameter set; only the template slot differs.
    vi.mocked(cachedAnimateDefaults).mockReturnValue({
      simplered: { selected: 0, slots: [{ intensity: 1, hue: 0.02, colorize: 1, saturation: 1, contrast: 1, params: { u_warmth: 0 } }] },
      simpleblue: { selected: 0, slots: [{ intensity: 1, hue: 0.62, colorize: 1, saturation: 1, contrast: 1, params: { u_warmth: 0 } }] },
    } as never);
    seed([strip]);
    renderScreen();
    chooseAdvanced();
    await screen.findByRole('switch', { name: 'Test Strip' });

    fireEvent.click(screen.getByRole('button', { name: 'lighting.controls.simplered' }));
    fireEvent.click(screen.getByRole('button', { name: 'lighting.controls.simpleblue' }));

    await waitFor(() => expect(startStatic).toHaveBeenCalledTimes(2));
    const [first, second] = vi.mocked(startStatic).mock.calls;
    expect(first[2]).toBe(0.02);
    expect(second[2]).toBe(0.62);
  });

  it('does not run a fill until a swatch is pressed', async () => {
    seed([strip]);
    renderScreen();
    chooseAdvanced();
    await screen.findByRole('switch', { name: 'Test Strip' });
    expect(startStatic).not.toHaveBeenCalled();
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

    await waitFor(() => expect(screen.getAllByTestId('led-strip')[0]).toHaveAttribute('data-hex', '#ff2d2d'));
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
    expect(screen.queryByRole('button', { name: 'lighting.ledMap.selectAll' })).toBeNull();
  });

  it('Simple drives every device, putting back any the user had switched off', async () => {
    seed([{ ...strip, controlled: false }]);
    const onComplete = renderScreen();
    await screen.findByRole('radio', { name: /lightingOnboarding\.mode\.simple/ });

    fireEvent.click(screen.getByRole('button', { name: 'lightingOnboarding.continue' }));

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(setLightingDeviceControlled).toHaveBeenCalledWith('openrgb-0', true);
    expect(stopLighting).not.toHaveBeenCalled();
  });

  it('No lighting stops the engine and leaves the picker out of it', async () => {
    seed([strip]);
    const onComplete = renderScreen();
    await screen.findByRole('radio', { name: /lightingOnboarding\.mode\.simple/ });

    fireEvent.click(screen.getByRole('radio', { name: /lightingOnboarding\.mode\.off/ }));
    // The devices still list, they just cannot be chosen between.
    expect(screen.getByRole('switch', { name: 'Test Strip' })).toBeInTheDocument();
    expect(document.querySelector('[class*=deviceGridLocked]')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'lightingOnboarding.continue' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(stopLighting).toHaveBeenCalledTimes(1);
  });
});
