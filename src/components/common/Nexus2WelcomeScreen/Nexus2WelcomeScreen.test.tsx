import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Nexus2WelcomeScreen } from './Nexus2WelcomeScreen';
import {
  applyNexus2Import, closeNexus2App, disableNexus2Autostart, dismissNexus2Welcome, previewNexus2Import,
} from '../../../api/migration';
import type { Nexus2PreviewResponse, Nexus2StatusResponse } from '../../../api/migration';

vi.mock('../../../api/migration', () => ({
  dismissNexus2Welcome: vi.fn(),
  disableNexus2Autostart: vi.fn(),
  closeNexus2App: vi.fn(),
  previewNexus2Import: vi.fn(),
  applyNexus2Import: vi.fn(),
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      if (!params) return key;
      return `${key}:${Object.values(params).join(',')}`;
    },
  }),
}));

const CONTINUE_BUTTON_NAME = 'nexus2Welcome.continue';
const CONTINUE_ANYWAY_BUTTON_NAME = 'nexus2Welcome.continueAnyway';
const IMPORT_BUTTON_NAME = 'nexus2Welcome.import.action';
const IMPORT_AND_CONTINUE_BUTTON_NAME = 'nexus2Welcome.importAndContinue';
const SKIP_BUTTON_NAME = 'nexus2Welcome.skipImport';
const Y70_GROUP_SWITCH_NAME = 'nexus2Welcome.import.group.y70Panel.label';

const BASE_PAYLOAD: Nexus2StatusResponse = {
  detected: true,
  importAvailable: false,
  deviceEligible: true,
  version: '2.16.0',
  autostartTaskPresent: false,
  running: false,
  pending: true,
};

const BASE_PREVIEW: Nexus2PreviewResponse = {
  available: true,
  profileName: 'Default',
  categories: [
    { id: 'appearance', available: true, accentColor: '#ff0000', background: null },
  ],
};

function renderScreen(payload: Nexus2StatusResponse | null, onComplete = vi.fn()) {
  return render(<Nexus2WelcomeScreen open payload={payload} onComplete={onComplete} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dismissNexus2Welcome).mockResolvedValue({ dismissed: true });
  vi.mocked(disableNexus2Autostart).mockResolvedValue({ error: false, msg: '' });
  vi.mocked(closeNexus2App).mockResolvedValue({ error: false, msg: '' });
  vi.mocked(previewNexus2Import).mockResolvedValue(BASE_PREVIEW);
  vi.mocked(applyNexus2Import).mockResolvedValue({ results: [] });
});

describe('Nexus2WelcomeScreen - rendering', () => {
  it('renders nothing when closed', () => {
    render(<Nexus2WelcomeScreen open={false} payload={BASE_PAYLOAD} onComplete={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('leads with the detected version as the heading', () => {
    renderScreen(BASE_PAYLOAD);
    expect(screen.getByRole('heading')).toHaveTextContent('nexus2Welcome.versionDetected:2.16.0');
  });

  it('falls back to the version-less heading when detection read no version', () => {
    renderScreen({ ...BASE_PAYLOAD, version: null });
    expect(screen.getByRole('heading')).toHaveTextContent('nexus2Welcome.title');
    expect(screen.queryByText(/nexus2Welcome.versionDetected/)).not.toBeInTheDocument();
  });

  it('states the close/autostart outcome with no switch to opt out of it', () => {
    renderScreen(BASE_PAYLOAD);
    expect(screen.getByText('nexus2Welcome.actions.title')).toBeInTheDocument();
    expect(screen.getByText('nexus2Welcome.actions.body')).toBeInTheDocument();
    // The import groups are the only switches on a payload with no import.
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
  });

  it('mentions the detected state, and only what was actually detected', () => {
    const { unmount } = render(
      <Nexus2WelcomeScreen open payload={{ ...BASE_PAYLOAD, running: true }} onComplete={vi.fn()} />,
    );
    expect(screen.getByText('nexus2Welcome.actions.running')).toBeInTheDocument();
    expect(screen.queryByText(/actions.autostart/)).not.toBeInTheDocument();
    unmount();

    renderScreen({ ...BASE_PAYLOAD, autostartTaskPresent: true });
    expect(screen.getByText('nexus2Welcome.actions.autostart')).toBeInTheDocument();
    expect(screen.queryByText(/actions.running/)).not.toBeInTheDocument();
  });

  it('omits the detected-state line when nothing is running and no task exists', () => {
    renderScreen(BASE_PAYLOAD);
    expect(screen.queryByText(/actions.running|actions.autostart/)).not.toBeInTheDocument();
  });

  it('does not render the import section when importAvailable is false', () => {
    renderScreen(BASE_PAYLOAD);
    expect(screen.queryByText(/nexus2Welcome.import.title/)).not.toBeInTheDocument();
    expect(previewNexus2Import).not.toHaveBeenCalled();
  });

  it('renders the import section, fetching the preview, when importAvailable is true', async () => {
    renderScreen({ ...BASE_PAYLOAD, importAvailable: true });
    await waitFor(() => expect(previewNexus2Import).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('switch', { name: Y70_GROUP_SWITCH_NAME })).toBeInTheDocument();
  });
});

describe('Nexus2WelcomeScreen - back navigation', () => {
  it('renders a Back button only when onBack is provided, and clicking it steps back without dismissing', () => {
    const onBack = vi.fn();
    const { unmount } = render(
      <Nexus2WelcomeScreen open payload={BASE_PAYLOAD} onComplete={vi.fn()} onBack={onBack} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'nav.back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(dismissNexus2Welcome).not.toHaveBeenCalled();
    unmount();

    renderScreen(BASE_PAYLOAD);
    expect(screen.queryByRole('button', { name: 'nav.back' })).toBeNull();
  });
});

describe('Nexus2WelcomeScreen - continue flow (no actions)', () => {
  it('still calls onComplete when the dismiss request fails, so the user is never trapped', async () => {
    vi.mocked(dismissNexus2Welcome).mockResolvedValue(null);
    const onComplete = vi.fn();
    renderScreen(BASE_PAYLOAD, onComplete);

    fireEvent.click(screen.getByRole('button', { name: CONTINUE_BUTTON_NAME }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });
});

describe('Nexus2WelcomeScreen - continue flow (actions)', () => {
  it('applies close before autostart, in order, then dismisses', async () => {
    const order: string[] = [];
    vi.mocked(closeNexus2App).mockImplementation(async () => { order.push('close'); return { error: false, msg: '' }; });
    vi.mocked(disableNexus2Autostart).mockImplementation(async () => { order.push('autostart'); return { error: false, msg: '' }; });
    const onComplete = vi.fn();
    renderScreen({ ...BASE_PAYLOAD, running: true, autostartTaskPresent: true }, onComplete);

    fireEvent.click(screen.getByRole('button', { name: CONTINUE_BUTTON_NAME }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(order).toEqual(['close', 'autostart']);
    expect(dismissNexus2Welcome).toHaveBeenCalledTimes(1);
  });

  it('runs both actions even when detection reported nothing to do', async () => {
    const onComplete = vi.fn();
    renderScreen(BASE_PAYLOAD, onComplete);

    fireEvent.click(screen.getByRole('button', { name: CONTINUE_BUTTON_NAME }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    // Both service ops are idempotent, so they run regardless of the payload.
    expect(closeNexus2App).toHaveBeenCalledTimes(1);
    expect(disableNexus2Autostart).toHaveBeenCalledTimes(1);
  });

  it('keeps the screen open and relabels Continue on a failure, then dismisses regardless on a second click', async () => {
    vi.mocked(closeNexus2App).mockResolvedValue({ error: true, msg: 'nope' });
    const onComplete = vi.fn();
    renderScreen({ ...BASE_PAYLOAD, running: true }, onComplete);

    fireEvent.click(screen.getByRole('button', { name: CONTINUE_BUTTON_NAME }));

    await waitFor(() => expect(screen.getByText('nexus2Welcome.actions.errorClose')).toBeInTheDocument());
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: CONTINUE_ANYWAY_BUTTON_NAME })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: CONTINUE_ANYWAY_BUTTON_NAME }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(closeNexus2App).toHaveBeenCalledTimes(1);
    expect(dismissNexus2Welcome).toHaveBeenCalledTimes(1);
  });

  it('surfaces a thrown action request as a failure instead of hanging Continue', async () => {
    vi.mocked(closeNexus2App).mockRejectedValue(new Error('network'));
    const onComplete = vi.fn();
    renderScreen({ ...BASE_PAYLOAD, running: true }, onComplete);

    fireEvent.click(screen.getByRole('button', { name: CONTINUE_BUTTON_NAME }));

    expect(await screen.findByRole('button', { name: CONTINUE_ANYWAY_BUTTON_NAME })).toBeEnabled();
    expect(onComplete).not.toHaveBeenCalled();
  });
});

describe('Nexus2WelcomeScreen - action failures', () => {
  it('names only the half that failed when autostart removal is the one that broke', async () => {
    vi.mocked(disableNexus2Autostart).mockResolvedValue({ error: true, msg: 'nope' });
    renderScreen({ ...BASE_PAYLOAD, running: true, autostartTaskPresent: true });

    fireEvent.click(screen.getByRole('button', { name: CONTINUE_BUTTON_NAME }));

    expect(await screen.findByText('nexus2Welcome.actions.errorAutostart')).toBeInTheDocument();
    expect(screen.queryByText('nexus2Welcome.actions.errorClose')).not.toBeInTheDocument();
  });
});

describe('Nexus2WelcomeScreen - import section wiring', () => {
  it('is optional: skipping works while the preview is loading', async () => {
    let resolvePreview: (v: Nexus2PreviewResponse) => void = () => {};
    vi.mocked(previewNexus2Import).mockReturnValue(new Promise(resolve => { resolvePreview = resolve; }));
    const onComplete = vi.fn();
    renderScreen({ ...BASE_PAYLOAD, importAvailable: true }, onComplete);

    fireEvent.click(screen.getByRole('button', { name: SKIP_BUTTON_NAME }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(applyNexus2Import).not.toHaveBeenCalled();

    resolvePreview(BASE_PREVIEW);
  });

  it('drives the import from its own button, with skipping offered beside it', async () => {
    renderScreen({ ...BASE_PAYLOAD, importAvailable: true });

    const y70 = await screen.findByRole('switch', { name: Y70_GROUP_SWITCH_NAME });
    // Two explicit choices, and the section keeps no apply button of its own.
    expect(await screen.findByRole('button', { name: IMPORT_AND_CONTINUE_BUTTON_NAME })).toBeEnabled();
    expect(screen.getByRole('button', { name: SKIP_BUTTON_NAME })).toBeEnabled();
    expect(screen.queryByRole('button', { name: IMPORT_BUTTON_NAME })).not.toBeInTheDocument();

    // Nothing selected leaves nothing to import, so that button goes quiet
    // while skipping stays available.
    fireEvent.click(y70);
    await waitFor(() => expect(screen.getByRole('button', { name: IMPORT_AND_CONTINUE_BUTTON_NAME })).toBeDisabled());
    expect(screen.getByRole('button', { name: SKIP_BUTTON_NAME })).toBeEnabled();
  });

  it('skips the import but still closes Nexus 2 and clears its autostart', async () => {
    const onComplete = vi.fn();
    renderScreen({ ...BASE_PAYLOAD, importAvailable: true, running: true }, onComplete);

    fireEvent.click(await screen.findByRole('button', { name: SKIP_BUTTON_NAME }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    // The coexistence actions are the part this screen promises either way.
    expect(applyNexus2Import).not.toHaveBeenCalled();
    expect(closeNexus2App).toHaveBeenCalledTimes(1);
    expect(disableNexus2Autostart).toHaveBeenCalledTimes(1);
  });

  it('applies the selected import then dismisses, in one Continue click', async () => {
    vi.mocked(applyNexus2Import).mockResolvedValue({ results: [{ id: 'appearance', status: 'applied' }] });
    const onComplete = vi.fn();
    renderScreen({ ...BASE_PAYLOAD, importAvailable: true }, onComplete);

    await screen.findByRole('switch', { name: Y70_GROUP_SWITCH_NAME });
    fireEvent.click(await screen.findByRole('button', { name: IMPORT_AND_CONTINUE_BUTTON_NAME }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(applyNexus2Import).toHaveBeenCalledTimes(1);
    expect(dismissNexus2Welcome).toHaveBeenCalledTimes(1);
  });

  it('offers the continue-anyway exit when the import hard-fails, and still runs the mandatory actions', async () => {
    vi.mocked(applyNexus2Import).mockResolvedValue({
      results: [{ id: 'appearance', status: 'failed' }],
    });
    const onComplete = vi.fn();
    renderScreen({ ...BASE_PAYLOAD, importAvailable: true, running: true }, onComplete);

    await screen.findByRole('switch', { name: Y70_GROUP_SWITCH_NAME });
    fireEvent.click(await screen.findByRole('button', { name: IMPORT_AND_CONTINUE_BUTTON_NAME }));

    const anyway = await screen.findByRole('button', { name: CONTINUE_ANYWAY_BUTTON_NAME });
    expect(onComplete).not.toHaveBeenCalled();
    // The gate latches shut on dismiss, so a failed import must never skip
    // the close/autostart it promises unconditionally.
    expect(closeNexus2App).toHaveBeenCalledTimes(1);
    expect(disableNexus2Autostart).toHaveBeenCalledTimes(1);

    fireEvent.click(anyway);
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    // Nothing is retried by the escape click.
    expect(applyNexus2Import).toHaveBeenCalledTimes(1);
    expect(closeNexus2App).toHaveBeenCalledTimes(1);
  });

});
