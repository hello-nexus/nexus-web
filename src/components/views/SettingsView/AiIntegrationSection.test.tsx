import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiIntegrationSection } from './AiIntegrationSection';
import {
  fetchAiStatus, postAiConfig, rotateAiToken, type AiStatusResponse,
  fetchAssistantStatus, installRuntime, removeRuntime, setUseSystemOllama, pullModel, removeModel, selectModel,
  type AiAssistantStatus, type AiAssistantProgressFrame, type AssistantCatalogModel,
} from '../../../api/aiIntegration';

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
  fetchAssistantStatus: vi.fn(),
  installRuntime: vi.fn(),
  removeRuntime: vi.fn(),
  setUseSystemOllama: vi.fn(),
  pullModel: vi.fn(),
  removeModel: vi.fn(),
  selectModel: vi.fn(),
}));

// Holds the live `aiAssistant` WS frame a test wants useTopic to return.
// vi.hoisted so the factory below (hoisted above this file's imports by
// vitest) can close over it safely - mirrors useSensors.test.ts.
const assistantWs = vi.hoisted(() => ({ frame: null as AiAssistantProgressFrame | null }));

vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopic: (topic: string) => (topic === 'aiAssistant' ? assistantWs.frame : null),
}));

// Build flavour under test; vitest's DEV env makes the real const always true.
const build = vi.hoisted(() => ({ devTools: true }));
vi.mock('../../../lib/devTools', () => ({ get DEV_TOOLS() { return build.devTools; } }));

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

// 1 GiB: exact enough that formatBytes renders a clean, assertable "1 GB".
const ONE_GIB = 1024 * 1024 * 1024;

const QWEN_4B: AssistantCatalogModel = {
  id: 'qwen3.5:4b', label: 'Qwen3.5 4B', downloadBytes: ONE_GIB, ramHint: '~4-5 GB RAM', recommended: true,
};
const QWEN_08B: AssistantCatalogModel = {
  id: 'qwen3.5:0.8b', label: 'Qwen3.5 0.8B', downloadBytes: ONE_GIB, ramHint: '~1-2 GB RAM', recommended: false,
};

function makeAssistantStatus(overrides: Partial<AiAssistantStatus> = {}): AiAssistantStatus {
  return {
    runtimeState: 'notInstalled',
    systemOllamaDetected: false,
    useSystemOllama: false,
    downloadProgress: null,
    installedModels: [],
    activeModel: '',
    catalog: [],
    busy: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  assistantWs.frame = null;
  build.devTools = true;
  vi.mocked(fetchAssistantStatus).mockResolvedValue(makeAssistantStatus());
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

describe('AiIntegrationSection - assistant', () => {
  it('release build: keeps the MCP rows, renders no runtime/model rows, and never fetches assistant status', async () => {
    build.devTools = false;
    vi.mocked(fetchAiStatus).mockResolvedValue(makeStatus({ enabled: true, token: 'secret-token' }));
    vi.mocked(fetchAssistantStatus).mockResolvedValue(makeAssistantStatus({ runtimeState: 'installed', catalog: [QWEN_4B] }));
    render(<AiIntegrationSection serviceOnline />);

    expect(await screen.findByText('settings.ai.token.label')).toBeInTheDocument();
    expect(screen.queryByText('settings.ai.assistant.runtime.label')).not.toBeInTheDocument();
    expect(screen.queryByText('settings.ai.assistant.model.label')).not.toBeInTheDocument();
    expect(fetchAssistantStatus).not.toHaveBeenCalled();
  });

  it('shows the not-installed runtime state with a download button, and installing starts the runtime', async () => {
    vi.mocked(fetchAiStatus).mockResolvedValue(makeStatus({ enabled: true }));
    vi.mocked(fetchAssistantStatus).mockResolvedValue(makeAssistantStatus());
    vi.mocked(installRuntime).mockResolvedValue(
      makeAssistantStatus({ runtimeState: 'downloading', downloadProgress: { received: 0, total: ONE_GIB } }),
    );
    render(<AiIntegrationSection serviceOnline />);

    expect(await screen.findByText('settings.ai.assistant.runtime.status.notInstalled')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'settings.ai.assistant.runtime.download' }));
    expect(installRuntime).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText(/percent=0 size=1 GB/)).toBeInTheDocument());
  });

  it('renders live download progress driven by the aiAssistant WS topic', async () => {
    vi.mocked(fetchAiStatus).mockResolvedValue(makeStatus({ enabled: true }));
    vi.mocked(fetchAssistantStatus).mockResolvedValue(
      makeAssistantStatus({ runtimeState: 'downloading', downloadProgress: { received: 0, total: ONE_GIB } }),
    );
    const { rerender } = render(<AiIntegrationSection serviceOnline />);
    await waitFor(() => expect(screen.getByText(/percent=0 size=1 GB/)).toBeInTheDocument());

    assistantWs.frame = {
      runtimeState: 'downloading',
      downloadProgress: { received: ONE_GIB / 2, total: ONE_GIB },
      pull: null,
    };
    // useTopic is a plain mocked function (not React state); rerendering the
    // same tree is what makes it re-evaluate and return the new frame,
    // mirroring how a real WS push re-renders the subscribing component.
    rerender(<AiIntegrationSection serviceOnline />);
    expect(await screen.findByText(/percent=50 size=1 GB/)).toBeInTheDocument();
  });

  it('shows the installed runtime state with a remove button behind a confirm modal', async () => {
    vi.mocked(fetchAiStatus).mockResolvedValue(makeStatus({ enabled: true }));
    vi.mocked(fetchAssistantStatus).mockResolvedValue(makeAssistantStatus({ runtimeState: 'installed' }));
    vi.mocked(removeRuntime).mockResolvedValue(makeAssistantStatus({ runtimeState: 'notInstalled' }));
    render(<AiIntegrationSection serviceOnline />);

    expect(await screen.findByText('settings.ai.assistant.runtime.status.installed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'settings.ai.assistant.runtime.remove' }));
    expect(screen.getByText('settings.ai.assistant.runtime.removeConfirmTitle')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'settings.ai.assistant.runtime.removeConfirmButton' }));
    await waitFor(() => expect(removeRuntime).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('settings.ai.assistant.runtime.removeConfirmTitle')).not.toBeInTheDocument());
  });

  it('lets a REST-only mutation override a stale, already-settled WS frame', async () => {
    vi.mocked(fetchAiStatus).mockResolvedValue(makeStatus({ enabled: true }));
    vi.mocked(fetchAssistantStatus).mockResolvedValue(makeAssistantStatus({ runtimeState: 'installed' }));
    vi.mocked(removeRuntime).mockResolvedValue(makeAssistantStatus({ runtimeState: 'notInstalled' }));
    // A settled (non-transient) frame left over from an earlier install -
    // useTopic seeds from a module-level last-frame cache, so this can be
    // stale relative to the section's current REST snapshot.
    assistantWs.frame = { runtimeState: 'installed', downloadProgress: null, pull: null };
    render(<AiIntegrationSection serviceOnline />);

    expect(await screen.findByText('settings.ai.assistant.runtime.status.installed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'settings.ai.assistant.runtime.remove' }));
    fireEvent.click(screen.getByRole('button', { name: 'settings.ai.assistant.runtime.removeConfirmButton' }));

    // No new WS push follows a plain removal, so this only passes if the
    // fresh REST response - not the still-cached 'installed' frame - drives
    // the displayed state.
    await waitFor(() => expect(screen.getByText('settings.ai.assistant.runtime.status.notInstalled')).toBeInTheDocument());
  });

  it('offers both retry-download and remove when the runtime is in an error state', async () => {
    vi.mocked(fetchAiStatus).mockResolvedValue(makeStatus({ enabled: true }));
    vi.mocked(fetchAssistantStatus).mockResolvedValue(makeAssistantStatus({ runtimeState: 'error' }));
    render(<AiIntegrationSection serviceOnline />);

    expect(await screen.findByText('settings.ai.assistant.runtime.status.error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'settings.ai.assistant.runtime.download' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'settings.ai.assistant.runtime.remove' })).toBeInTheDocument();
  });

  it('shows an action-error note when a mutation returns no response', async () => {
    vi.mocked(fetchAiStatus).mockResolvedValue(makeStatus({ enabled: true }));
    vi.mocked(fetchAssistantStatus).mockResolvedValue(makeAssistantStatus());
    vi.mocked(installRuntime).mockResolvedValue(null);
    render(<AiIntegrationSection serviceOnline />);

    expect(await screen.findByText('settings.ai.assistant.runtime.status.notInstalled')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'settings.ai.assistant.runtime.download' }));
    expect(await screen.findByText('settings.ai.assistant.actionError')).toBeInTheDocument();
  });

  it('shows the system-detected state without install/remove controls when a system Ollama is found', async () => {
    vi.mocked(fetchAiStatus).mockResolvedValue(makeStatus({ enabled: true }));
    vi.mocked(fetchAssistantStatus).mockResolvedValue(
      makeAssistantStatus({ runtimeState: 'running', systemOllamaDetected: true }),
    );
    render(<AiIntegrationSection serviceOnline />);

    expect(await screen.findByText('settings.ai.assistant.runtime.status.systemDetected')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'settings.ai.assistant.runtime.download' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'settings.ai.assistant.runtime.remove' })).not.toBeInTheDocument();
  });

  it('the use-system-Ollama toggle is off by default and opts in on click', async () => {
    vi.mocked(fetchAiStatus).mockResolvedValue(makeStatus({ enabled: true }));
    vi.mocked(fetchAssistantStatus).mockResolvedValue(makeAssistantStatus());
    vi.mocked(setUseSystemOllama).mockResolvedValue(
      makeAssistantStatus({ runtimeState: 'running', systemOllamaDetected: true, useSystemOllama: true }),
    );
    render(<AiIntegrationSection serviceOnline />);

    const toggle = await screen.findByRole('switch', { name: 'settings.ai.assistant.runtime.useSystem.label' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(toggle);
    expect(setUseSystemOllama).toHaveBeenCalledWith(true);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    // Adopting the system runtime hides the download/remove controls, same as
    // detection arriving any other way.
    expect(screen.queryByRole('button', { name: 'settings.ai.assistant.runtime.download' })).not.toBeInTheDocument();
  });

  it('shows the model catalog with a recommended badge, and downloading a model calls pullModel', async () => {
    vi.mocked(fetchAiStatus).mockResolvedValue(makeStatus({ enabled: true }));
    vi.mocked(fetchAssistantStatus).mockResolvedValue(makeAssistantStatus({ runtimeState: 'running', catalog: [QWEN_4B] }));
    vi.mocked(pullModel).mockResolvedValue(
      makeAssistantStatus({ runtimeState: 'running', catalog: [QWEN_4B], busy: { kind: 'pullingModel', model: QWEN_4B.id } }),
    );
    render(<AiIntegrationSection serviceOnline />);

    expect(await screen.findByText('Qwen3.5 4B')).toBeInTheDocument();
    expect(screen.getByText('settings.ai.assistant.model.recommended')).toBeInTheDocument();

    // The button's accessible name is the per-model aria-label (Download +
    // the model name), not the bare "Download" text, so multiple catalog
    // rows stay distinguishable to assistive tech.
    fireEvent.click(screen.getByRole('button', { name: `settings.ai.assistant.model.downloadAria model=${QWEN_4B.label}` }));
    await waitFor(() => expect(pullModel).toHaveBeenCalledWith(QWEN_4B.id));
  });

  it('does not wedge the model row on a stale non-success pull frame once REST confirms nothing is pulling', async () => {
    vi.mocked(fetchAiStatus).mockResolvedValue(makeStatus({ enabled: true }));
    vi.mocked(fetchAssistantStatus).mockResolvedValue(makeAssistantStatus({ runtimeState: 'running', catalog: [QWEN_4B] }));
    // A pull that failed or aborted before terminating in {status:'success'}
    // can leave the aiAssistant WS topic frozen on a non-success phase
    // (useTopic seeds from a module-level last-frame cache that outlives a
    // remount). REST reporting no pullModel busy op must still show the
    // download button rather than a permanently stuck progress bar.
    assistantWs.frame = {
      runtimeState: 'running', downloadProgress: null,
      pull: { model: QWEN_4B.id, status: 'error pulling image', received: 10, total: 100 },
    };
    render(<AiIntegrationSection serviceOnline />);

    expect(await screen.findByText('Qwen3.5 4B')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `settings.ai.assistant.model.downloadAria model=${QWEN_4B.label}` })).toBeInTheDocument();
    expect(screen.queryByText('error pulling image')).not.toBeInTheDocument();
  });

  it('converges via the fallback poll when a pull is busy but no WS frame ever arrives', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.mocked(fetchAiStatus).mockResolvedValue(makeStatus({ enabled: true }));
      // First snapshot: a pull is busy (buttons disabled), and the WS topic
      // never delivers a frame. The poll must still un-wedge the row off the
      // REST busy signal alone.
      vi.mocked(fetchAssistantStatus)
        .mockResolvedValueOnce(makeAssistantStatus({ runtimeState: 'running', catalog: [QWEN_4B], busy: { kind: 'pullingModel', model: QWEN_4B.id } }))
        .mockResolvedValue(makeAssistantStatus({ runtimeState: 'running', catalog: [QWEN_4B] }));
      render(<AiIntegrationSection serviceOnline />);

      const downloadName = `settings.ai.assistant.model.downloadAria model=${QWEN_4B.label}`;
      await vi.waitFor(() => expect(screen.getByRole('button', { name: downloadName })).toBeDisabled());

      await vi.advanceTimersByTimeAsync(4000);
      await vi.waitFor(() => expect(screen.getByRole('button', { name: downloadName })).not.toBeDisabled());
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks the active model, offers Use for a ready non-active model, and selecting it calls selectModel', async () => {
    const installed = makeAssistantStatus({
      runtimeState: 'running',
      catalog: [QWEN_4B, QWEN_08B],
      installedModels: [
        { id: QWEN_4B.id, sizeBytes: QWEN_4B.downloadBytes },
        { id: QWEN_08B.id, sizeBytes: QWEN_08B.downloadBytes },
      ],
      activeModel: QWEN_4B.id,
    });
    vi.mocked(fetchAiStatus).mockResolvedValue(makeStatus({ enabled: true }));
    vi.mocked(fetchAssistantStatus).mockResolvedValue(installed);
    vi.mocked(selectModel).mockResolvedValue({ ...installed, activeModel: QWEN_08B.id });
    render(<AiIntegrationSection serviceOnline />);

    await waitFor(() => expect(screen.getByText('settings.ai.assistant.model.active')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: `settings.ai.assistant.model.useAria model=${QWEN_08B.label}` }));
    await waitFor(() => expect(selectModel).toHaveBeenCalledWith(QWEN_08B.id));
  });

  it('removes an installed, inactive model behind a confirm modal', async () => {
    const installed = makeAssistantStatus({
      runtimeState: 'running',
      catalog: [QWEN_4B, QWEN_08B],
      installedModels: [
        { id: QWEN_4B.id, sizeBytes: QWEN_4B.downloadBytes },
        { id: QWEN_08B.id, sizeBytes: QWEN_08B.downloadBytes },
      ],
      activeModel: QWEN_4B.id,
    });
    vi.mocked(fetchAiStatus).mockResolvedValue(makeStatus({ enabled: true }));
    vi.mocked(fetchAssistantStatus).mockResolvedValue(installed);
    vi.mocked(removeModel).mockResolvedValue({
      ...installed, catalog: [QWEN_4B], installedModels: [{ id: QWEN_4B.id, sizeBytes: QWEN_4B.downloadBytes }],
    });
    render(<AiIntegrationSection serviceOnline />);

    await waitFor(() => expect(screen.getByText('settings.ai.assistant.model.active')).toBeInTheDocument());
    // Both catalog rows are installed, so both show a Remove button; the
    // per-model aria-label is what keeps them distinguishable to a query by
    // role/name (and to assistive tech) instead of colliding on plain "Remove".
    expect(screen.getByRole('button', { name: `settings.ai.assistant.model.removeAria model=${QWEN_4B.label}` })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: `settings.ai.assistant.model.removeAria model=${QWEN_08B.label}` }));
    expect(screen.getByText('settings.ai.assistant.model.removeConfirmTitle')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'settings.ai.assistant.model.removeConfirmButton' }));
    await waitFor(() => expect(removeModel).toHaveBeenCalledWith(QWEN_08B.id));
  });
});
