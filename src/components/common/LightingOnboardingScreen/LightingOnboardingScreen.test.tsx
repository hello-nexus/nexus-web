import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LightingOnboardingScreen } from './LightingOnboardingScreen';
import {
  fetchLightingDevices,
  fetchLightingStatus,
  setLightingDeviceControlled,
  type LightingDevice,
} from '../../../api/lighting';
import { completeLightingOnboarding } from '../../../api/onboarding';
import { useConflictApps } from '../../../hooks/useConflictApps';

vi.mock('../../../api/lighting', () => ({
  fetchLightingDevices: vi.fn(),
  fetchLightingStatus: vi.fn(),
  setLightingDeviceControlled: vi.fn(),
  // ZoneCard's identify affordance; unused in toggleMode but imported.
  identifyLightingDevice: vi.fn(),
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useConflictApps).mockReturnValue({ conflicts: [], ready: true });
  vi.mocked(setLightingDeviceControlled).mockResolvedValue(null);
});

describe('LightingOnboardingScreen - device grid', () => {
  it('renders one whole-card switch per device, checked for controlled and unchecked for ignored', async () => {
    seed([strip, hub]);
    renderScreen();

    const stripCard = await screen.findByRole('switch', { name: 'Test Strip' });
    const hubCard = screen.getByRole('switch', { name: 'Test Hub' });
    expect(stripCard).toHaveAttribute('aria-checked', 'true');
    expect(hubCard).toHaveAttribute('aria-checked', 'false');
  });

  it('Enter on a focused card toggles it without firing the Overlay Continue handler', async () => {
    seed([strip]);
    vi.mocked(completeLightingOnboarding).mockResolvedValue({ completed: true, lightingCompleted: true });
    const onComplete = renderScreen();

    const card = await screen.findByRole('switch', { name: 'Test Strip' });
    fireEvent.keyDown(card, { key: 'Enter' });

    expect(setLightingDeviceControlled).toHaveBeenCalledWith('openrgb-0', false);
    expect(completeLightingOnboarding).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('clicking a controlled card ignores it, clicking an ignored card restores it', async () => {
    seed([strip, hub]);
    renderScreen();

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

  it('shows the scanning note while a scan is in flight with devices already listed', async () => {
    seed([strip], true);
    renderScreen();

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

  it('renders no conflict section when none are detected', async () => {
    seed([strip]);
    renderScreen();

    await screen.findByRole('switch', { name: 'Test Strip' });
    expect(screen.queryByText('conflicts.modal.intro')).not.toBeInTheDocument();
  });
});

describe('LightingOnboardingScreen - continue flow', () => {
  it('calls onComplete once the completion write reports lightingCompleted:true', async () => {
    seed([strip]);
    vi.mocked(completeLightingOnboarding).mockResolvedValue({ completed: true, lightingCompleted: true });
    const onComplete = renderScreen();

    await screen.findByRole('switch', { name: 'Test Strip' });
    fireEvent.click(screen.getByRole('button', { name: 'lightingOnboarding.continue' }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(completeLightingOnboarding).toHaveBeenCalled();
  });

  it('shows the error message and never calls onComplete when the write fails', async () => {
    seed([strip]);
    vi.mocked(completeLightingOnboarding).mockResolvedValue(null);
    const onComplete = renderScreen();

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
    await screen.findByRole('switch', { name: 'Test Strip' });

    fireEvent.click(screen.getByRole('button', { name: 'nav.back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(completeLightingOnboarding).not.toHaveBeenCalled();
    unmount();

    render(<LightingOnboardingScreen open onComplete={vi.fn()} />);
    await screen.findByRole('switch', { name: 'Test Strip' });
    expect(screen.queryByRole('button', { name: 'nav.back' })).toBeNull();
  });
});
