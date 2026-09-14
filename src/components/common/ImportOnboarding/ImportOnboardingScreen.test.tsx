import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportOnboardingScreen } from './ImportOnboardingScreen';
import {
  applyFanControlImport, closeFanControlApp, disableFanControlAutostart,
  dismissFanControlImport, fetchFanControlStatus, previewFanControlImport,
} from '../../../api/fancontrol';
import type { FanControlStatusResponse } from '../../../api/fancontrol';
import {
  applyNexus2Import, closeNexus2App, disableNexus2Autostart,
  dismissNexus2Welcome, fetchNexus2Status, previewNexus2Import,
} from '../../../api/migration';
import type { Nexus2StatusResponse } from '../../../api/migration';

vi.mock('../../../api/fancontrol', () => ({
  fetchFanControlStatus: vi.fn(), previewFanControlImport: vi.fn(), applyFanControlImport: vi.fn(),
  dismissFanControlImport: vi.fn(), closeFanControlApp: vi.fn(), disableFanControlAutostart: vi.fn(),
}));

vi.mock('../../../api/migration', () => ({
  fetchNexus2Status: vi.fn(), previewNexus2Import: vi.fn(), applyNexus2Import: vi.fn(),
  dismissNexus2Welcome: vi.fn(), closeNexus2App: vi.fn(), disableNexus2Autostart: vi.fn(),
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    language: 'en',
    t: (key: string, params?: Record<string, string | number>) =>
      (params ? `${key}:${Object.values(params).join(',')}` : key),
  }),
}));

const FAN_CONTROL: FanControlStatusResponse = {
  detected: true, running: true, importAvailable: true, autostartPresent: true,
  version: '217', installLocation: 'C:\\FanControl',
  configs: [{ path: 'a', name: 'userConfig', modifiedUnixMs: 1, isDefault: true }],
  pending: true, completed: false,
};

const NEXUS2: Nexus2StatusResponse = {
  detected: true, importAvailable: true, deviceEligible: true, version: '2.16.0',
  autostartTaskPresent: true, running: true, pending: true,
};

const IMPORT_AND_CONTINUE = 'importOnboarding.importAndContinue';
const SKIP = 'importOnboarding.skip';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchFanControlStatus).mockResolvedValue(FAN_CONTROL);
  vi.mocked(fetchNexus2Status).mockResolvedValue(NEXUS2);
  vi.mocked(previewFanControlImport).mockResolvedValue({
    available: true, configName: 'userConfig', version: 215, curves: [], fans: [], skipped: [],
    curveCount: 1, calibrationCount: 0, nameCount: 0, offsetCount: 0, manualCount: 0, error: false, msg: 'Ok',
  });
  vi.mocked(previewNexus2Import).mockResolvedValue({
    available: true, profileName: 'Default',
    categories: [{ id: 'appearance', available: true, accentColor: '#fff', background: null }],
  });
  vi.mocked(applyFanControlImport).mockResolvedValue({
    error: false, msg: 'Ok', curvesImported: 1, calibrationsImported: 0, namesImported: 0, offsetsImported: 0, manualImported: 0,
  });
  vi.mocked(applyNexus2Import).mockResolvedValue({ results: [{ id: 'appearance', status: 'applied', detail: null }] });
  for (const m of [dismissFanControlImport, dismissNexus2Welcome]) vi.mocked(m).mockResolvedValue({ dismissed: true });
  for (const m of [closeFanControlApp, disableFanControlAutostart, closeNexus2App, disableNexus2Autostart]) {
    vi.mocked(m).mockResolvedValue({ error: false, msg: 'Ok' });
  }
});

const BOTH_OFFERED = { nexus2: true, fancontrol: true };

function renderScreen(props: Partial<Parameters<typeof ImportOnboardingScreen>[0]> = {}) {
  return render(
    <ImportOnboardingScreen
      open
      nexus2={NEXUS2}
      fanControl={FAN_CONTROL}
      offeredFor={BOTH_OFFERED}
      onComplete={vi.fn()}
      {...props}
    />,
  );
}

describe('ImportOnboardingScreen', () => {
  it('renders nothing while closed', () => {
    renderScreen({ open: false });
    expect(screen.queryByText('importOnboarding.title')).not.toBeInTheDocument();
  });

  it('lists every app that has something to import, Nexus 2 first', async () => {
    renderScreen();
    const names = await screen.findAllByText(/^importCenter\.source\.(nexus2|fancontrol)$/);
    expect(names.map(n => n.textContent)).toEqual(['importCenter.source.nexus2', 'importCenter.source.fancontrol']);
  });

  it('dismisses an app that is installed but has nothing to import', async () => {
    const onComplete = vi.fn();
    renderScreen({
      nexus2: { ...NEXUS2, importAvailable: false },
      offeredFor: { nexus2: true, fancontrol: true },
      onComplete,
    });

    // Nothing is ticked (FanControl is opt-in), so the one button is Continue.
    fireEvent.click(await screen.findByRole('button', { name: 'importOnboarding.continue' }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    // Not listed (nothing to bring over), but its gate is still spent.
    expect(screen.queryByText('importCenter.source.nexus2')).not.toBeInTheDocument();
    expect(dismissNexus2Welcome).toHaveBeenCalledTimes(1);
  });

  it('imports what is ticked, then dismisses, in one press', async () => {
    const onComplete = vi.fn();
    renderScreen({ onComplete });

    const go = await screen.findByRole('button', { name: IMPORT_AND_CONTINUE });
    await waitFor(() => expect(go).toBeEnabled());
    fireEvent.click(go);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(applyNexus2Import).toHaveBeenCalledTimes(1);
    // Off by default, so it is not brought over unless asked for.
    expect(applyFanControlImport).not.toHaveBeenCalled();
    expect(dismissNexus2Welcome).toHaveBeenCalledTimes(1);
    expect(dismissFanControlImport).toHaveBeenCalledTimes(1);
  });

  it('does not latch the offer flag of an app this gate is not being shown for', async () => {
    const onComplete = vi.fn();
    renderScreen({ offeredFor: { nexus2: false, fancontrol: true }, onComplete });

    const go = await screen.findByRole('button', { name: IMPORT_AND_CONTINUE });
    await waitFor(() => expect(go).toBeEnabled());
    fireEvent.click(go);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    // Listed and on by default like any other app, so it imports; but it has
    // not been offered here, so its gate is not marked as spent.
    expect(applyNexus2Import).toHaveBeenCalledTimes(1);
    expect(dismissNexus2Welcome).not.toHaveBeenCalled();
    expect(dismissFanControlImport).toHaveBeenCalledTimes(1);
  });

  it('never closes a detected app or clears its autostart', async () => {
    // The screen used to fire both for every detected app as a side effect of
    // continuing. Ending an app is now the end-of-onboarding conflict step's
    // job, on an explicit per-app click.
    const onComplete = vi.fn();
    renderScreen({ onComplete });

    fireEvent.click(await screen.findByRole('button', { name: SKIP }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));

    expect(closeFanControlApp).not.toHaveBeenCalled();
    expect(disableFanControlAutostart).not.toHaveBeenCalled();
    expect(closeNexus2App).not.toHaveBeenCalled();
    expect(disableNexus2Autostart).not.toHaveBeenCalled();
  });

  it('offers no back step when there is no screen behind it', async () => {
    renderScreen();
    await screen.findByRole('button', { name: SKIP });
    expect(screen.queryByRole('button', { name: 'nav.back' })).not.toBeInTheDocument();
  });

  it('promises no app closure in the cards, and offers one switch each', async () => {
    renderScreen();
    await screen.findByText('importCenter.source.nexus2');
    expect(screen.queryByText('importOnboarding.closeApp')).not.toBeInTheDocument();
    // One switch per card: whether the app is included. Closing it is not one.
    const cards = document.querySelectorAll('[class*=sourceRow]');
    expect(cards).toHaveLength(2);
    cards.forEach(card => expect(card.querySelectorAll('[role=switch]')).toHaveLength(1));
  });

  it('reads Continue with nothing ticked, live, and offers no Skip import', async () => {
    const onComplete = vi.fn();
    renderScreen({
      nexus2: { ...NEXUS2, importAvailable: false },
      offeredFor: { fancontrol: true },
      onComplete,
    });

    // FanControl is opt-in, so nothing is ticked: one button, nothing to skip.
    const go = await screen.findByRole('button', { name: 'importOnboarding.continue' });
    expect(go).toBeEnabled();
    expect(screen.queryByRole('button', { name: SKIP })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: IMPORT_AND_CONTINUE })).not.toBeInTheDocument();

    fireEvent.click(go);
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(applyFanControlImport).not.toHaveBeenCalled();
    expect(dismissFanControlImport).toHaveBeenCalledTimes(1);
  });

  it('starts with Nexus 2 included and every other app opt-in', async () => {
    renderScreen();
    const nexus2 = await screen.findByLabelText('importCenter.include:importCenter.source.nexus2');
    const fanControl = screen.getByLabelText('importCenter.include:importCenter.source.fancontrol');
    expect(nexus2).toHaveAttribute('aria-checked', 'true');
    expect(fanControl).toHaveAttribute('aria-checked', 'false');
  });
});
