import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ManageConflictAppsModal } from './ManageConflictAppsModal';
import {
  fetchConflictCatalog, fetchDynamicLighting, setDynamicLighting,
  type WindowsDynamicLightingState,
} from '../../../api/conflicts';
import { useConflictApps } from '../../../hooks/useConflictApps';

vi.mock('../../../api/conflicts', () => ({
  fetchConflictCatalog: vi.fn(),
  fetchDynamicLighting: vi.fn(),
  setDynamicLighting: vi.fn(),
}));

const LIGHTING_OFF_PLATFORM = { available: false, enabled: false, foregroundAppControl: false, deviceCount: 0, devicesEnabled: 0 };

vi.mock('../../../hooks/useConflictApps', () => ({
  useConflictApps: vi.fn(),
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const CATALOG = [
  { id: 'nzxt-cam', displayName: 'NZXT CAM', category: 'lighting' },
  { id: 'signalrgb', displayName: 'SignalRGB', category: 'lighting' },
  { id: 'msi-afterburner', displayName: 'MSI Afterburner', category: 'monitoring' },
];

function renderModal(overrides: Partial<Parameters<typeof ManageConflictAppsModal>[0]> = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    autoShutdown: false,
    onAutoShutdownChange: vi.fn(),
    exclusions: [] as string[],
    onExclusionsChange: vi.fn(),
    ...overrides,
  };
  render(<ManageConflictAppsModal {...props} />);
  return props;
}

// Every existing case runs on a machine with no readable Lighting key, so the
// section is absent unless a case opts in.
beforeEach(() => {
  vi.mocked(fetchDynamicLighting).mockResolvedValue(LIGHTING_OFF_PLATFORM);
  vi.mocked(setDynamicLighting).mockResolvedValue(null);
});

describe('ManageConflictAppsModal', () => {
  it('lists every catalog app, on by default', async () => {
    vi.mocked(fetchConflictCatalog).mockResolvedValue(CATALOG);
    vi.mocked(useConflictApps).mockReturnValue({ conflicts: [], ready: true });
    renderModal();

    await waitFor(() => expect(screen.getByLabelText('NZXT CAM')).toBeTruthy());
    for (const app of CATALOG) {
      expect(screen.getByLabelText(app.displayName).getAttribute('aria-checked')).toBe('true');
    }
  });

  it('shows an excluded app as off', async () => {
    vi.mocked(fetchConflictCatalog).mockResolvedValue(CATALOG);
    vi.mocked(useConflictApps).mockReturnValue({ conflicts: [], ready: true });
    renderModal({ exclusions: ['signalrgb'] });

    await waitFor(() => expect(screen.getByLabelText('SignalRGB')).toBeTruthy());
    expect(screen.getByLabelText('SignalRGB').getAttribute('aria-checked')).toBe('false');
    expect(screen.getByLabelText('NZXT CAM').getAttribute('aria-checked')).toBe('true');
  });

  it('turning an app off adds it to the exclusions', async () => {
    vi.mocked(fetchConflictCatalog).mockResolvedValue(CATALOG);
    vi.mocked(useConflictApps).mockReturnValue({ conflicts: [], ready: true });
    const props = renderModal();

    await waitFor(() => expect(screen.getByLabelText('NZXT CAM')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('NZXT CAM'));
    expect(props.onExclusionsChange).toHaveBeenCalledWith(['nzxt-cam']);
  });

  it('turning an excluded app back on drops it from the exclusions', async () => {
    vi.mocked(fetchConflictCatalog).mockResolvedValue(CATALOG);
    vi.mocked(useConflictApps).mockReturnValue({ conflicts: [], ready: true });
    const props = renderModal({ exclusions: ['nzxt-cam', 'signalrgb'] });

    await waitFor(() => expect(screen.getByLabelText('NZXT CAM')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('NZXT CAM'));
    expect(props.onExclusionsChange).toHaveBeenCalledWith(['signalrgb']);
  });

  it('lifts a detected app into its own group ahead of the rest', async () => {
    vi.mocked(fetchConflictCatalog).mockResolvedValue(CATALOG);
    vi.mocked(useConflictApps).mockReturnValue({
      conflicts: [{ id: 'msi-afterburner', displayName: 'MSI Afterburner', category: 'monitoring', processName: 'MSIAfterburner', pid: 42 }],
      ready: true,
    });
    renderModal();

    await waitFor(() => expect(screen.getByText('settings.conflictApps.runningNow')).toBeTruthy());
    const headings = screen.getAllByRole('heading', { level: 4 }).map(h => h.textContent);
    expect(headings[0]).toBe('settings.conflictApps.runningNow');
    // The running app is listed once - in that group, not again under its category.
    expect(screen.getAllByLabelText('MSI Afterburner')).toHaveLength(1);
    expect(headings).not.toContain('settings.conflictApps.category.monitoring');
  });

  it('hides the Dynamic Lighting section when the service cannot read it', async () => {
    vi.mocked(fetchConflictCatalog).mockResolvedValue(CATALOG);
    vi.mocked(useConflictApps).mockReturnValue({ conflicts: [], ready: true });
    renderModal();

    await waitFor(() => expect(screen.getByLabelText('NZXT CAM')).toBeTruthy());
    expect(screen.queryByText('settings.conflictApps.dynamicLighting.title')).toBeNull();
  });

  it('renders the Dynamic Lighting toggles from the state the service reported', async () => {
    vi.mocked(fetchConflictCatalog).mockResolvedValue(CATALOG);
    vi.mocked(useConflictApps).mockReturnValue({ conflicts: [], ready: true });
    vi.mocked(fetchDynamicLighting).mockResolvedValue({
      available: true, enabled: true, foregroundAppControl: false, deviceCount: 3, devicesEnabled: 2,
    });
    renderModal();

    await waitFor(() => expect(screen.getByText('settings.conflictApps.dynamicLighting.title')).toBeTruthy());
    expect(screen.getByLabelText('settings.conflictApps.dynamicLighting.enabled').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByLabelText('settings.conflictApps.dynamicLighting.foreground').getAttribute('aria-checked')).toBe('false');
    // Any device still on reads as on - the one switch covers them all.
    expect(screen.getByLabelText('settings.conflictApps.dynamicLighting.devices').getAttribute('aria-checked')).toBe('true');
  });

  it('drops the per-device switch when Windows has registered no devices', async () => {
    vi.mocked(fetchConflictCatalog).mockResolvedValue(CATALOG);
    vi.mocked(useConflictApps).mockReturnValue({ conflicts: [], ready: true });
    vi.mocked(fetchDynamicLighting).mockResolvedValue({
      available: true, enabled: true, foregroundAppControl: true, deviceCount: 0, devicesEnabled: 0,
    });
    renderModal();

    await waitFor(() => expect(screen.getByText('settings.conflictApps.dynamicLighting.title')).toBeTruthy());
    expect(screen.queryByLabelText('settings.conflictApps.dynamicLighting.devices')).toBeNull();
  });

  it('writes only the toggled setting, and renders what the service read back', async () => {
    vi.mocked(fetchConflictCatalog).mockResolvedValue(CATALOG);
    vi.mocked(useConflictApps).mockReturnValue({ conflicts: [], ready: true });
    vi.mocked(fetchDynamicLighting).mockResolvedValue({
      available: true, enabled: true, foregroundAppControl: true, deviceCount: 3, devicesEnabled: 3,
    });
    vi.mocked(setDynamicLighting).mockResolvedValue({
      available: true, enabled: false, foregroundAppControl: true, deviceCount: 3, devicesEnabled: 3,
    });
    renderModal();

    await waitFor(() => expect(screen.getByText('settings.conflictApps.dynamicLighting.title')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('settings.conflictApps.dynamicLighting.enabled'));
    expect(setDynamicLighting).toHaveBeenCalledWith({ enabled: false });
    await waitFor(() => expect(
      screen.getByLabelText('settings.conflictApps.dynamicLighting.enabled').getAttribute('aria-checked'),
    ).toBe('false'));
  });

  it('a slow earlier write does not overwrite the newer one', async () => {
    vi.mocked(fetchConflictCatalog).mockResolvedValue(CATALOG);
    vi.mocked(useConflictApps).mockReturnValue({ conflicts: [], ready: true });
    vi.mocked(fetchDynamicLighting).mockResolvedValue({
      available: true, enabled: true, foregroundAppControl: true, deviceCount: 3, devicesEnabled: 3,
    });

    let resolveFirst: (v: WindowsDynamicLightingState) => void = () => {};
    vi.mocked(setDynamicLighting)
      .mockReturnValueOnce(new Promise<WindowsDynamicLightingState>(r => { resolveFirst = r; }))
      .mockResolvedValueOnce({
        available: true, enabled: true, foregroundAppControl: false, deviceCount: 3, devicesEnabled: 3,
      });
    renderModal();

    await waitFor(() => expect(screen.getByText('settings.conflictApps.dynamicLighting.title')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('settings.conflictApps.dynamicLighting.enabled'));
    fireEvent.click(screen.getByLabelText('settings.conflictApps.dynamicLighting.foreground'));

    await waitFor(() => expect(
      screen.getByLabelText('settings.conflictApps.dynamicLighting.foreground').getAttribute('aria-checked'),
    ).toBe('false'));

    // The first write lands last, carrying a snapshot taken before the second.
    resolveFirst({ available: true, enabled: false, foregroundAppControl: true, deviceCount: 3, devicesEnabled: 3 });
    await waitFor(() => expect(
      screen.getByLabelText('settings.conflictApps.dynamicLighting.foreground').getAttribute('aria-checked'),
    ).toBe('false'));
    expect(screen.getByLabelText('settings.conflictApps.dynamicLighting.enabled').getAttribute('aria-checked')).toBe('true');
  });
});
