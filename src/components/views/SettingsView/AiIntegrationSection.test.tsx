import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiIntegrationSection } from './AiIntegrationSection';
import { fetchAiStatus, postAiConfig, rotateAiToken, type AiStatusResponse } from '../../../api/aiIntegration';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      let text = key;
      if (params) for (const [k, v] of Object.entries(params)) text += ` ${k}=${v}`;
      return text;
    },
  }),
}));

vi.mock('../../../api/aiIntegration', () => ({
  fetchAiStatus: vi.fn(),
  postAiConfig: vi.fn(),
  rotateAiToken: vi.fn(),
}));

function makeStatus(overrides: Partial<AiStatusResponse> = {}): AiStatusResponse {
  return {
    enabled: false,
    running: false,
    port: 9420,
    endpoint: 'http://127.0.0.1:9420/mcp',
    token: '',
    lastError: null,
    capabilities: { telemetry: true, cooling: true, lighting: true, profiles: true, history: true },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe('AiIntegrationSection', () => {
  it('does not fetch status while the service is offline', () => {
    render(<AiIntegrationSection serviceOnline={false} />);
    expect(fetchAiStatus).not.toHaveBeenCalled();
  });

  it('renders the master toggle off, with no capability rows, when disabled', async () => {
    vi.mocked(fetchAiStatus).mockResolvedValue(makeStatus({ enabled: false }));
    render(<AiIntegrationSection serviceOnline />);

    const toggle = await screen.findByRole('switch', { name: 'settings.ai.master.label' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByText('settings.ai.token.label')).not.toBeInTheDocument();
  });

  it('renders no section at all when the status endpoint is unavailable (offline or older service)', async () => {
    vi.mocked(fetchAiStatus).mockResolvedValue(null);
    render(<AiIntegrationSection serviceOnline />);

    await waitFor(() => expect(fetchAiStatus).toHaveBeenCalled());
    expect(screen.queryByText('settings.ai.title')).not.toBeInTheDocument();
  });

  it('shows capability toggles, token row, and endpoint info once enabled', async () => {
    vi.mocked(fetchAiStatus).mockResolvedValue(makeStatus({ enabled: true, running: true, token: 'secret-token' }));
    render(<AiIntegrationSection serviceOnline />);

    await waitFor(() => expect(screen.getByText('settings.ai.token.label')).toBeInTheDocument());
    expect(screen.getByRole('switch', { name: 'settings.ai.capability.cooling.label' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'settings.ai.capability.telemetry.label' })).toBeInTheDocument();
    expect(screen.getByText('settings.ai.status.running')).toBeInTheDocument();
    expect(screen.getByText('http://127.0.0.1:9420/mcp')).toBeInTheDocument();
    // Masked by default - the raw token never renders until revealed.
    expect(screen.queryByText('secret-token')).not.toBeInTheDocument();
  });

  it('reveals the token on click and re-masks on a second click', async () => {
    vi.mocked(fetchAiStatus).mockResolvedValue(makeStatus({ enabled: true, token: 'secret-token' }));
    render(<AiIntegrationSection serviceOnline />);
    await waitFor(() => expect(screen.getByText('settings.ai.token.label')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'settings.ai.token.reveal' }));
    expect(screen.getByText('secret-token')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'settings.ai.token.hide' }));
    expect(screen.queryByText('secret-token')).not.toBeInTheDocument();
  });

  it('resets the revealed token when the master toggle turns off, so re-enabling shows it masked again', async () => {
    const initial = makeStatus({ enabled: true, token: 'secret-token' });
    vi.mocked(fetchAiStatus).mockResolvedValue(initial);
    vi.mocked(postAiConfig)
      .mockResolvedValueOnce({ ...initial, enabled: false })
      .mockResolvedValueOnce({ ...initial, enabled: true });
    render(<AiIntegrationSection serviceOnline />);
    await waitFor(() => expect(screen.getByText('settings.ai.token.label')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'settings.ai.token.reveal' }));
    expect(screen.getByText('secret-token')).toBeInTheDocument();

    const master = screen.getByRole('switch', { name: 'settings.ai.master.label' });
    fireEvent.click(master);
    // The optimistic flip hides the token row immediately, before the response lands.
    await waitFor(() => expect(screen.queryByText('settings.ai.token.label')).not.toBeInTheDocument());
    await waitFor(() => expect(master).not.toBeDisabled());

    fireEvent.click(master);
    await waitFor(() => expect(screen.getByText('settings.ai.token.label')).toBeInTheDocument());
    expect(screen.queryByText('secret-token')).not.toBeInTheDocument();
  });

  it('copies the token to the clipboard and flips the button label back after a timeout', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(fetchAiStatus).mockResolvedValue(makeStatus({ enabled: true, token: 'secret-token' }));
    render(<AiIntegrationSection serviceOnline />);
    await waitFor(() => expect(screen.getByText('settings.ai.token.label')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'settings.ai.token.copy' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('secret-token'));
    expect(await screen.findByText('settings.ai.token.copied')).toBeInTheDocument();

    vi.advanceTimersByTime(1500);
    await waitFor(() => expect(screen.getByText('settings.ai.token.copy')).toBeInTheDocument());
    vi.useRealTimers();
  });

  it('flips the master toggle optimistically and reconciles to the server response', async () => {
    const initial = makeStatus({ enabled: false });
    vi.mocked(fetchAiStatus).mockResolvedValue(initial);
    const enabled = makeStatus({ enabled: true, token: 'fresh-token' });
    vi.mocked(postAiConfig).mockResolvedValue(enabled);
    render(<AiIntegrationSection serviceOnline />);

    const toggle = await screen.findByRole('switch', { name: 'settings.ai.master.label' });
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(postAiConfig).toHaveBeenCalledWith({ enabled: true });
    await waitFor(() => expect(screen.getByText('settings.ai.token.label')).toBeInTheDocument());
  });

  it('rolls back the master toggle when the request fails', async () => {
    vi.mocked(fetchAiStatus).mockResolvedValue(makeStatus({ enabled: false }));
    vi.mocked(postAiConfig).mockResolvedValue(null);
    render(<AiIntegrationSection serviceOnline />);

    const toggle = await screen.findByRole('switch', { name: 'settings.ai.master.label' });
    fireEvent.click(toggle);

    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
  });

  it('toggles a single capability via a partial patch', async () => {
    const initial = makeStatus({ enabled: true });
    vi.mocked(fetchAiStatus).mockResolvedValue(initial);
    vi.mocked(postAiConfig).mockResolvedValue({
      ...initial,
      capabilities: { ...initial.capabilities, cooling: false },
    });
    render(<AiIntegrationSection serviceOnline />);

    const coolingToggle = await screen.findByRole('switch', { name: 'settings.ai.capability.cooling.label' });
    fireEvent.click(coolingToggle);

    expect(postAiConfig).toHaveBeenCalledWith({ capabilities: { cooling: false } });
    await waitFor(() => expect(coolingToggle).toHaveAttribute('aria-checked', 'false'));
  });

  it('locks every mutating control while one request is in flight, so a slow capability response can never be clobbered by an overlapping master toggle', async () => {
    const initial = makeStatus({ enabled: true });
    vi.mocked(fetchAiStatus).mockResolvedValue(initial);
    let resolveCooling!: (v: AiStatusResponse | null) => void;
    vi.mocked(postAiConfig).mockImplementationOnce(() => new Promise(resolve => { resolveCooling = resolve; }));
    render(<AiIntegrationSection serviceOnline />);
    await waitFor(() => expect(screen.getByText('settings.ai.token.label')).toBeInTheDocument());

    const coolingToggle = screen.getByRole('switch', { name: 'settings.ai.capability.cooling.label' });
    const masterToggle = screen.getByRole('switch', { name: 'settings.ai.master.label' });

    fireEvent.click(coolingToggle);
    expect(postAiConfig).toHaveBeenCalledTimes(1);
    expect(coolingToggle).toHaveAttribute('aria-checked', 'false');

    // The capability request is still pending - every other mutating control locks.
    expect(masterToggle).toBeDisabled();
    fireEvent.click(masterToggle);
    expect(postAiConfig).toHaveBeenCalledTimes(1);
    expect(masterToggle).toHaveAttribute('aria-checked', 'true');

    resolveCooling({ ...initial, capabilities: { ...initial.capabilities, cooling: false } });
    await waitFor(() => expect(masterToggle).not.toBeDisabled());

    // Only now can the master toggle fire its own, separate request.
    vi.mocked(postAiConfig).mockResolvedValueOnce({ ...initial, enabled: false, capabilities: { ...initial.capabilities, cooling: false } });
    fireEvent.click(masterToggle);

    await waitFor(() => expect(postAiConfig).toHaveBeenCalledTimes(2));
    expect(postAiConfig).toHaveBeenNthCalledWith(1, { capabilities: { cooling: false } });
    expect(postAiConfig).toHaveBeenNthCalledWith(2, { enabled: false });
    await waitFor(() => expect(screen.queryByText('settings.ai.token.label')).not.toBeInTheDocument());
  });

  it('rotates the token behind the confirm dialog', async () => {
    const initial = makeStatus({ enabled: true, token: 'old-token' });
    vi.mocked(fetchAiStatus).mockResolvedValue(initial);
    vi.mocked(rotateAiToken).mockResolvedValue({ ...initial, token: 'new-token' });
    render(<AiIntegrationSection serviceOnline />);
    await waitFor(() => expect(screen.getByText('settings.ai.token.label')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'settings.ai.rotate.button' }));
    expect(screen.getByText('settings.ai.rotate.confirmTitle')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'settings.ai.rotate.confirmButton' }));
    await waitFor(() => expect(rotateAiToken).toHaveBeenCalled());
    expect(screen.queryByText('settings.ai.rotate.confirmTitle')).not.toBeInTheDocument();

    // The freshly rotated token stays masked until explicitly revealed again.
    expect(screen.queryByText('new-token')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'settings.ai.token.reveal' }));
    expect(screen.getByText('new-token')).toBeInTheDocument();
  });

  it('guards rotateToken against re-entry: a second click on the confirm button while one rotate is in flight fires only once', async () => {
    const initial = makeStatus({ enabled: true, token: 'old-token' });
    vi.mocked(fetchAiStatus).mockResolvedValue(initial);
    let resolveRotate!: (v: AiStatusResponse | null) => void;
    vi.mocked(rotateAiToken).mockImplementation(() => new Promise(resolve => { resolveRotate = resolve; }));
    render(<AiIntegrationSection serviceOnline />);
    await waitFor(() => expect(screen.getByText('settings.ai.token.label')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'settings.ai.rotate.button' }));
    const confirmBtn = screen.getByRole('button', { name: 'settings.ai.rotate.confirmButton' });
    fireEvent.click(confirmBtn);

    expect(rotateAiToken).toHaveBeenCalledTimes(1);
    expect(confirmBtn).toBeDisabled();

    // A second click while the first rotate is still in flight must not fire another.
    fireEvent.click(confirmBtn);
    expect(rotateAiToken).toHaveBeenCalledTimes(1);

    // Nor does pressing Enter while the confirm button is disabled.
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(rotateAiToken).toHaveBeenCalledTimes(1);

    resolveRotate({ ...initial, token: 'new-token' });
    await waitFor(() => expect(screen.queryByText('settings.ai.rotate.confirmTitle')).not.toBeInTheDocument());
  });

  it('keeps the rotate dialog open with a failure note when rotation fails, and clears it on the next open', async () => {
    const initial = makeStatus({ enabled: true, token: 'old-token' });
    vi.mocked(fetchAiStatus).mockResolvedValue(initial);
    vi.mocked(rotateAiToken).mockResolvedValue(null);
    render(<AiIntegrationSection serviceOnline />);
    await waitFor(() => expect(screen.getByText('settings.ai.token.label')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'settings.ai.rotate.button' }));
    fireEvent.click(screen.getByRole('button', { name: 'settings.ai.rotate.confirmButton' }));
    await waitFor(() => expect(rotateAiToken).toHaveBeenCalled());

    // A failed rotation is a security-relevant outcome: the dialog must not
    // close silently as if the old token had been revoked.
    expect(screen.getByText('settings.ai.rotate.confirmTitle')).toBeInTheDocument();
    expect(screen.getByText('settings.ai.rotate.failed')).toBeInTheDocument();

    // The failure note does not stick to the next attempt.
    fireEvent.click(screen.getByRole('button', { name: 'confirm.cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'settings.ai.rotate.button' }));
    expect(screen.queryByText('settings.ai.rotate.failed')).not.toBeInTheDocument();
  });

  it('re-enables the controls when a mutation request rejects instead of resolving', async () => {
    const initial = makeStatus({ enabled: false });
    vi.mocked(fetchAiStatus).mockResolvedValue(initial);
    vi.mocked(postAiConfig).mockRejectedValueOnce(new Error('malformed body'));
    render(<AiIntegrationSection serviceOnline />);
    const master = await screen.findByRole('switch');

    fireEvent.click(master);
    // The throw path must clear the busy flags and roll back the optimistic
    // flip, or the section wedges disabled until remount.
    await waitFor(() => expect(master).not.toBeDisabled());
    expect(master).not.toBeChecked();

    vi.mocked(postAiConfig).mockResolvedValueOnce({ ...initial, enabled: true });
    fireEvent.click(master);
    await waitFor(() => expect(master).toBeChecked());
  });

  it('shows the last error in a danger-tone row when present', async () => {
    vi.mocked(fetchAiStatus).mockResolvedValue(makeStatus({ enabled: true, lastError: 'bind failed: port in use' }));
    render(<AiIntegrationSection serviceOnline />);

    expect(await screen.findByText('bind failed: port in use')).toBeInTheDocument();
  });

  it('disables interactive controls when the service is offline after a successful load', async () => {
    vi.mocked(fetchAiStatus).mockResolvedValue(makeStatus({ enabled: true, token: 'secret-token' }));
    const { rerender } = render(<AiIntegrationSection serviceOnline />);
    await waitFor(() => expect(screen.getByText('settings.ai.token.label')).toBeInTheDocument());

    rerender(<AiIntegrationSection serviceOnline={false} />);

    expect(screen.getByRole('switch', { name: 'settings.ai.master.label' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'settings.ai.token.copy' })).toBeDisabled();
  });
});
