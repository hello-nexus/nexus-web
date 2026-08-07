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
const CLOSE_SWITCH_NAME = 'nexus2Welcome.closeApp.rowLabel';
const AUTOSTART_SWITCH_NAME = 'nexus2Welcome.autostart.rowLabel';
const IMPORT_BUTTON_NAME = 'nexus2Welcome.import.action';
const IMPORT_AND_CONTINUE_BUTTON_NAME = 'nexus2Welcome.importAndContinue';
const CONFIRM_SWITCH_NAME = 'nexus2Welcome.import.confirmReplaceLayout';
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

  it('shows the detected version from the payload', () => {
    renderScreen(BASE_PAYLOAD);
    expect(screen.getByText('nexus2Welcome.versionDetected:2.16.0')).toBeInTheDocument();
  });

  it('omits the version line when the payload has no version', () => {
    renderScreen({ ...BASE_PAYLOAD, version: null });
    expect(screen.queryByText(/nexus2Welcome.versionDetected/)).not.toBeInTheDocument();
  });

  it('hides both action switches when neither running nor autostartTaskPresent is set', () => {
    renderScreen(BASE_PAYLOAD);
    expect(screen.queryByRole('switch', { name: CLOSE_SWITCH_NAME })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: AUTOSTART_SWITCH_NAME })).not.toBeInTheDocument();
  });

  it('shows the close switch, pre-checked, only when running is true', () => {
    renderScreen({ ...BASE_PAYLOAD, running: true });
    const box = screen.getByRole('switch', { name: CLOSE_SWITCH_NAME });
    expect(box).toBeInTheDocument();
    expect(box).toBeChecked();
    expect(screen.queryByRole('switch', { name: AUTOSTART_SWITCH_NAME })).not.toBeInTheDocument();
  });

  it('shows the autostart switch, pre-checked, only when autostartTaskPresent is true', () => {
    renderScreen({ ...BASE_PAYLOAD, autostartTaskPresent: true });
    const box = screen.getByRole('switch', { name: AUTOSTART_SWITCH_NAME });
    expect(box).toBeInTheDocument();
    expect(box).toBeChecked();
    expect(screen.queryByRole('switch', { name: CLOSE_SWITCH_NAME })).not.toBeInTheDocument();
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
  it('dismisses and calls onComplete without touching close/autostart when neither row shows', async () => {
    const onComplete = vi.fn();
    renderScreen(BASE_PAYLOAD, onComplete);

    fireEvent.click(screen.getByRole('button', { name: CONTINUE_BUTTON_NAME }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(dismissNexus2Welcome).toHaveBeenCalledTimes(1);
    expect(closeNexus2App).not.toHaveBeenCalled();
    expect(disableNexus2Autostart).not.toHaveBeenCalled();
  });

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

  it('skips an unchecked action silently', async () => {
    const onComplete = vi.fn();
    renderScreen({ ...BASE_PAYLOAD, running: true, autostartTaskPresent: true }, onComplete);

    fireEvent.click(screen.getByRole('switch', { name: AUTOSTART_SWITCH_NAME }));
    fireEvent.click(screen.getByRole('button', { name: CONTINUE_BUTTON_NAME }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(closeNexus2App).toHaveBeenCalledTimes(1);
    expect(disableNexus2Autostart).not.toHaveBeenCalled();
  });

  it('keeps the screen open and relabels Continue on a failure, then dismisses regardless on a second click', async () => {
    vi.mocked(closeNexus2App).mockResolvedValue({ error: true, msg: 'nope' });
    const onComplete = vi.fn();
    renderScreen({ ...BASE_PAYLOAD, running: true }, onComplete);

    fireEvent.click(screen.getByRole('button', { name: CONTINUE_BUTTON_NAME }));

    await waitFor(() => expect(screen.getByText('nexus2Welcome.closeApp.error')).toBeInTheDocument());
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: CONTINUE_ANYWAY_BUTTON_NAME })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: CONTINUE_ANYWAY_BUTTON_NAME }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(closeNexus2App).toHaveBeenCalledTimes(1);
    expect(dismissNexus2Welcome).toHaveBeenCalledTimes(1);
  });

  it('shows a success line for an applied action', async () => {
    renderScreen({ ...BASE_PAYLOAD, running: true });
    fireEvent.click(screen.getByRole('button', { name: CONTINUE_BUTTON_NAME }));
    await waitFor(() => expect(screen.getByText('nexus2Welcome.closeApp.success')).toBeInTheDocument());
  });
});

describe('Nexus2WelcomeScreen - import section wiring', () => {
  it('is optional: Continue still works while the preview is loading', async () => {
    let resolvePreview: (v: Nexus2PreviewResponse) => void = () => {};
    vi.mocked(previewNexus2Import).mockReturnValue(new Promise(resolve => { resolvePreview = resolve; }));
    const onComplete = vi.fn();
    renderScreen({ ...BASE_PAYLOAD, importAvailable: true }, onComplete);

    fireEvent.click(screen.getByRole('button', { name: CONTINUE_BUTTON_NAME }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(applyNexus2Import).not.toHaveBeenCalled();

    resolvePreview(BASE_PREVIEW);
  });

  it('drives the import from Continue: no in-section apply button, and the label follows the selection', async () => {
    renderScreen({ ...BASE_PAYLOAD, importAvailable: true });

    const y70 = await screen.findByRole('switch', { name: Y70_GROUP_SWITCH_NAME });
    // Groups start selected, so Continue offers to import first (the label
    // flips a render after the preview lands, hence findBy).
    expect(await screen.findByRole('button', { name: IMPORT_AND_CONTINUE_BUTTON_NAME })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: IMPORT_BUTTON_NAME })).not.toBeInTheDocument();

    fireEvent.click(y70);
    await waitFor(() => expect(screen.getByRole('button', { name: CONTINUE_BUTTON_NAME })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: IMPORT_AND_CONTINUE_BUTTON_NAME })).not.toBeInTheDocument();
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

  it('offers the continue-anyway exit when the import hard-fails, so the gate is never a dead end', async () => {
    vi.mocked(applyNexus2Import).mockResolvedValue({
      results: [{ id: 'appearance', status: 'failed' }],
    });
    const onComplete = vi.fn();
    renderScreen({ ...BASE_PAYLOAD, importAvailable: true }, onComplete);

    await screen.findByRole('switch', { name: Y70_GROUP_SWITCH_NAME });
    fireEvent.click(await screen.findByRole('button', { name: IMPORT_AND_CONTINUE_BUTTON_NAME }));

    const anyway = await screen.findByRole('button', { name: CONTINUE_ANYWAY_BUTTON_NAME });
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(anyway);
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    // The failed import is never retried by the escape click.
    expect(applyNexus2Import).toHaveBeenCalledTimes(1);
  });

  it('keeps the screen open when the import comes back unclean, so the user can confirm and retry', async () => {
    vi.mocked(applyNexus2Import).mockResolvedValue({
      results: [{ id: 'appearance', status: 'needsConfirm' }],
    });
    const onComplete = vi.fn();
    renderScreen({ ...BASE_PAYLOAD, importAvailable: true }, onComplete);

    await screen.findByRole('switch', { name: Y70_GROUP_SWITCH_NAME });
    fireEvent.click(await screen.findByRole('button', { name: IMPORT_AND_CONTINUE_BUTTON_NAME }));

    await waitFor(() => expect(applyNexus2Import).toHaveBeenCalledTimes(1));
    expect(onComplete).not.toHaveBeenCalled();
    expect(dismissNexus2Welcome).not.toHaveBeenCalled();
    // Still actionable: the confirm switch appeared and Continue is live again.
    expect(await screen.findByRole('switch', { name: CONFIRM_SWITCH_NAME })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: IMPORT_AND_CONTINUE_BUTTON_NAME })).toBeEnabled();
  });
});
