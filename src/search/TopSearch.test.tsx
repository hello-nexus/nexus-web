import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TopSearch } from './TopSearch';
import { CommandPaletteProvider } from './CommandPaletteProvider';
import { fetchAssistantStatus, runAssistantQuery, type AiAssistantStatus, type AiAssistantQueryResponse } from '../api/aiIntegration';
import { buildEntries } from './providers';
import type { SearchEntry } from './types';
import styles from './TopSearch.module.scss';

vi.mock('../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      let text = key;
      if (params) for (const [k, v] of Object.entries(params)) text += ` ${k}=${v}`;
      return text;
    },
  }),
}));

vi.mock('../api/aiIntegration', () => ({
  fetchAssistantStatus: vi.fn(),
  runAssistantQuery: vi.fn(),
}));

vi.mock('../hooks/useUiSettings', () => ({
  useUiSettings: () => ({ settings: {}, update: vi.fn() }),
}));

vi.mock('../hooks/useUnifiedDevices', () => ({
  useUnifiedDevices: () => ({ unified: [] }),
}));

vi.mock('../hooks/useProfiles', () => ({
  useProfiles: () => ({ profiles: [], activeId: 'default', switchProfile: vi.fn() }),
}));

vi.mock('./usePanelToggles', () => ({
  usePanelToggles: () => ({ remoteEnabled: false, relayEnabled: false, wifiEnabled: false }),
}));

vi.mock('./useSearchLiveState', () => ({
  useSearchLiveState: () => ({
    musicReactive: null, telemetry: null, tracking: null, globalBrightness: null,
    lightingDevices: null, smartLights: null, obs: null, discord: null, cloud: null, volume: null,
  }),
}));

vi.mock('../widgets/marketplaceRegistry', () => ({
  subscribeMarketplaceRegistry: () => () => {},
}));

// No registry entries by default - isolates every test to the AI-synthesized
// entry (and the calc/param ones, which don't match these free-text queries).
// Individual tests override the return value to add a real matching entry.
vi.mock('./providers', () => ({
  buildEntries: vi.fn(),
}));

vi.mock('./helloGreetingStore', () => ({
  dismissHelloGreeting: () => {},
  useHelloGreetingPending: () => null,
}));

vi.mock('../lib/backgroundEffects', () => ({
  emitRadialBloomFromElement: () => {},
}));

function makeAssistantStatus(overrides: Partial<AiAssistantStatus> = {}): AiAssistantStatus {
  return {
    runtimeState: 'notInstalled',
    systemOllamaDetected: false,
    downloadProgress: null,
    installedModels: [],
    activeModel: '',
    catalog: [],
    busy: null,
    ...overrides,
  };
}

const READY_STATUS = makeAssistantStatus({
  runtimeState: 'running',
  installedModels: [{ id: 'qwen3.5:4b', sizeBytes: 1 }],
  activeModel: 'qwen3.5:4b',
});

function renderSearch() {
  render(
    <CommandPaletteProvider navigate={vi.fn()} onPairPhone={vi.fn()}>
      <TopSearch pageTitle="Dashboard" online platform="windows" />
    </CommandPaletteProvider>,
  );
}

function openPalette() {
  fireEvent.click(screen.getByRole('button', { name: 'search.placeholder' }));
  return screen.getByRole('combobox');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(buildEntries).mockReturnValue([]);
});

describe('TopSearch - AI assistant entry', () => {
  it('offers the ask entry once the assistant reports a ready runtime + active installed model', async () => {
    vi.mocked(fetchAssistantStatus).mockResolvedValue(READY_STATUS);
    renderSearch();
    const input = openPalette();

    fireEvent.change(input, { target: { value: 'how do I change my rgb colors' } });
    expect(await screen.findByText('search.ai.ask.title')).toBeInTheDocument();
  });

  it('does not offer the ask entry, and does not glow, when the assistant is not usable', async () => {
    vi.mocked(fetchAssistantStatus).mockResolvedValue(makeAssistantStatus({ runtimeState: 'notInstalled' }));
    renderSearch();
    const input = openPalette();

    await waitFor(() => expect(fetchAssistantStatus).toHaveBeenCalled());
    fireEvent.change(input, { target: { value: 'how do I change my rgb colors' } });

    expect(screen.queryByText('search.ai.ask.title')).not.toBeInTheDocument();
    expect(input.closest(`.${styles.pill}`)?.className).not.toContain(styles.pillAi);
  });

  it('does not offer the ask entry for a query shorter than the minimum length', async () => {
    vi.mocked(fetchAssistantStatus).mockResolvedValue(READY_STATUS);
    renderSearch();
    const input = openPalette();
    await waitFor(() => expect(fetchAssistantStatus).toHaveBeenCalled());

    fireEvent.change(input, { target: { value: 'ab' } });
    expect(screen.queryByText('search.ai.ask.title')).not.toBeInTheDocument();
  });

  it('adds the glow modifier class to the pill once usable, independent of the typed query', async () => {
    vi.mocked(fetchAssistantStatus).mockResolvedValue(READY_STATUS);
    renderSearch();
    const input = openPalette();

    await waitFor(() => expect(input.closest(`.${styles.pill}`)?.className).toContain(styles.pillAi));
  });

  it('submits the ask entry on Enter, shows a loading state, then renders the answer and a ran: tools line', async () => {
    vi.mocked(fetchAssistantStatus).mockResolvedValue(READY_STATUS);
    let resolveQuery!: (v: AiAssistantQueryResponse | null) => void;
    vi.mocked(runAssistantQuery).mockImplementation(() => new Promise((resolve) => { resolveQuery = resolve; }));
    renderSearch();
    const input = openPalette();

    fireEvent.change(input, { target: { value: 'turn my lighting off' } });
    await screen.findByText('search.ai.ask.title');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(runAssistantQuery).toHaveBeenCalledWith('turn my lighting off', expect.any(AbortSignal));
    expect(await screen.findByText('search.ai.thinking')).toBeInTheDocument();
    // The input keeps its text while the query is in flight.
    expect(input).toHaveValue('turn my lighting off');

    resolveQuery({ answer: 'Lighting is now off.', toolsRun: [{ name: 'set_lighting_mode', ok: true }] });

    expect(await screen.findByText('Lighting is now off.')).toBeInTheDocument();
    expect(screen.getByText(/search\.ai\.toolsRun/)).toHaveTextContent('set_lighting_mode');
    expect(screen.queryByText('search.ai.thinking')).not.toBeInTheDocument();
  });

  it('shows an error line when the query fails', async () => {
    vi.mocked(fetchAssistantStatus).mockResolvedValue(READY_STATUS);
    vi.mocked(runAssistantQuery).mockResolvedValue(null);
    renderSearch();
    const input = openPalette();

    fireEvent.change(input, { target: { value: 'do something' } });
    await screen.findByText('search.ai.ask.title');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByText('search.ai.error')).toBeInTheDocument();
  });

  it('recovers to the error state when the query request rejects, instead of staying stuck loading', async () => {
    vi.mocked(fetchAssistantStatus).mockResolvedValue(READY_STATUS);
    vi.mocked(runAssistantQuery).mockRejectedValue(new Error('bad response'));
    renderSearch();
    const input = openPalette();

    fireEvent.change(input, { target: { value: 'do something' } });
    await screen.findByText('search.ai.ask.title');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByText('search.ai.error')).toBeInTheDocument();
    expect(screen.queryByText('search.ai.thinking')).not.toBeInTheDocument();
  });

  it('ignores a second Enter while a query is already in flight', async () => {
    vi.mocked(fetchAssistantStatus).mockResolvedValue(READY_STATUS);
    vi.mocked(runAssistantQuery).mockImplementation(() => new Promise(() => {}));
    renderSearch();
    const input = openPalette();

    fireEvent.change(input, { target: { value: 'do something' } });
    await screen.findByText('search.ai.ask.title');
    fireEvent.keyDown(input, { key: 'Enter' });
    await screen.findByText('search.ai.thinking');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(runAssistantQuery).toHaveBeenCalledTimes(1);
  });

  it('editing the query after an answer drops the answer and returns to normal search', async () => {
    vi.mocked(fetchAssistantStatus).mockResolvedValue(READY_STATUS);
    vi.mocked(runAssistantQuery).mockResolvedValue({ answer: 'Done.', toolsRun: [] });
    renderSearch();
    const input = openPalette();

    fireEvent.change(input, { target: { value: 'do something' } });
    await screen.findByText('search.ai.ask.title');
    fireEvent.keyDown(input, { key: 'Enter' });
    await screen.findByText('Done.');

    fireEvent.change(input, { target: { value: 'do something else' } });
    expect(screen.queryByText('Done.')).not.toBeInTheDocument();
  });
});

describe('TopSearch - AI ask default highlight', () => {
  it('keeps the ask entry visible but defaults to the first real match, so Enter navigates instead of asking', async () => {
    const run = vi.fn();
    const realEntry: SearchEntry = { id: 'nav:lighting', title: 'Lighting', kind: 'navigate', run };
    vi.mocked(buildEntries).mockReturnValue([realEntry]);
    vi.mocked(fetchAssistantStatus).mockResolvedValue(READY_STATUS);
    renderSearch();
    const input = openPalette();

    fireEvent.change(input, { target: { value: 'lighting' } });
    await screen.findByText('search.ai.ask.title');
    // The ask entry appears the instant `usable` flips true, one render
    // before the default-active effect catches up to the now-shifted index -
    // wait for that settle rather than asserting on the transient frame.
    await waitFor(() => {
      const realRow = screen.getByText('Lighting').closest('[role="option"]');
      expect(realRow).toHaveAttribute('aria-selected', 'true');
    });
    const askRow = screen.getByText('search.ai.ask.title').closest('[role="option"]');
    expect(askRow).toHaveAttribute('aria-selected', 'false');

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(run).toHaveBeenCalledTimes(1);
    expect(runAssistantQuery).not.toHaveBeenCalled();
  });

  it('still lets arrowing to the ask row and pressing Enter submit the assistant query', async () => {
    const run = vi.fn();
    const realEntry: SearchEntry = { id: 'nav:lighting', title: 'Lighting', kind: 'navigate', run };
    vi.mocked(buildEntries).mockReturnValue([realEntry]);
    vi.mocked(fetchAssistantStatus).mockResolvedValue(READY_STATUS);
    vi.mocked(runAssistantQuery).mockResolvedValue({ answer: 'Done.', toolsRun: [] });
    renderSearch();
    const input = openPalette();

    fireEvent.change(input, { target: { value: 'lighting' } });
    await screen.findByText('search.ai.ask.title');
    await waitFor(() => {
      const realRow = screen.getByText('Lighting').closest('[role="option"]');
      expect(realRow).toHaveAttribute('aria-selected', 'true');
    });

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    const askRow = screen.getByText('search.ai.ask.title').closest('[role="option"]');
    expect(askRow).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(runAssistantQuery).toHaveBeenCalledWith('lighting', expect.any(AbortSignal));
    expect(run).not.toHaveBeenCalled();
  });

  it('defaults to the ask entry, so Enter asks the assistant, when there is no real match', async () => {
    vi.mocked(buildEntries).mockReturnValue([]);
    vi.mocked(fetchAssistantStatus).mockResolvedValue(READY_STATUS);
    vi.mocked(runAssistantQuery).mockResolvedValue({ answer: 'Done.', toolsRun: [] });
    renderSearch();
    const input = openPalette();

    fireEvent.change(input, { target: { value: 'how do rgb effects work' } });
    await screen.findByText('search.ai.ask.title');
    const askRow = screen.getByText('search.ai.ask.title').closest('[role="option"]');
    expect(askRow).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(runAssistantQuery).toHaveBeenCalledWith('how do rgb effects work', expect.any(AbortSignal));
  });
});
