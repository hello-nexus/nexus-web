import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AstralState } from '../../../api/astral';
import { AstralDevicePage } from './AstralDevicePage';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    language: 'en',
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));

const api = vi.hoisted(() => ({
  fetchAstral: vi.fn(),
  saveAstralSettings: vi.fn(),
  calibrateAstral: vi.fn(),
  cancelAstralShutdown: vi.fn(),
  shutdownAstralNow: vi.fn(),
}));
vi.mock('../../../api/astral', () => api);

const live = vi.hoisted(() => ({ sensors: [] as { id: string; value: number }[] }));
vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopic: (topic: string) => (topic === 'gpu' ? [{ id: 'gpu0', name: 'GPU', sensors: live.sensors }] : null),
}));

const cd = (reason: 'overcurrent' | 'critical', ms: number, gpuId = 'gpu0') =>
  ({ reason, endsAtMs: Date.now() + ms, remainingMs: ms, gpuId });

const pins = (states: string[] = []) =>
  [0, 1, 2, 3, 4, 5].map(i => ({ amps: 7 + i / 10, state: states[i] ?? 'ok' }));

const base = (over: Partial<AstralState> = {}): AstralState => ({
  supported: true,
  cards: [{
    gpuId: 'gpu0',
    name: 'ROG Astral',
    level: { available: true, calibrating: false, calibratedAtMs: 1_700_000_000_000 },
    pins: pins() as AstralState['cards'][0]['pins'],
    state: 'ok',
  }],
  settings: { alerts: true, equalizer: false, overcurrentShutdown: false, overcurrentSeconds: 60, countdownSeconds: 60, criticalShutdown: false },
  heldOff: false,
  simulated: false,
  ...over,
});

async function mount(state: AstralState) {
  api.fetchAstral.mockResolvedValue(state);
  await act(async () => { render(<AstralDevicePage />); });
}

const openPower = () => fireEvent.click(screen.getByText('devices.astral.tab.power'));
const openLevel = () => fireEvent.click(screen.getByText('devices.astral.tab.level'));

describe('AstralDevicePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    live.sensors = [];
  });

  it('colors each pin by its state and names the state in text, from one snapshot', async () => {
    live.sensors = [{ id: 'gpu0/astral/pin1/current', value: 99 }];
    const s = base();
    s.cards[0].pins[2] = { amps: 13, state: 'overcurrent' };
    s.cards[0].state = 'overcurrent';
    await mount(s);
    openPower();
    expect(screen.getByText('13.00 A')).toBeInTheDocument();
    expect(screen.queryByText('99.00 A')).toBeNull();
    const pin3 = screen.getByRole('group', { name: /devices.astral.pinLabel:\{"n":3/ });
    expect(pin3.getAttribute('aria-label')).toContain('devices.astral.state.overcurrent');
    expect(screen.getByRole('group', { name: /"n":1,/ }).getAttribute('aria-label')).toContain('devices.astral.state.ok');
    expect(screen.getByRole('alert')).toHaveTextContent('devices.astral.alertLine.one:{"state":"devices.astral.state.overcurrent","pins":"3"}');
  });

  it('names every abnormal pin and its state in text, grouped, with a plural for several', async () => {
    const s = base();
    s.cards[0].pins[0] = { amps: 15, state: 'warning' };
    s.cards[0].pins[2] = { amps: 13, state: 'overcurrent' };
    s.cards[0].pins[4] = { amps: 13, state: 'overcurrent' };
    s.cards[0].state = 'overcurrent';
    await mount(s);
    openPower();
    const text = screen.getByRole('alert').textContent ?? '';
    expect(text).toContain('devices.astral.alertLine.other:{"state":"devices.astral.state.overcurrent","pins":"3, 5"}');
    expect(text).toContain('devices.astral.alertLine.one:{"state":"devices.astral.state.warning","pins":"1"}');
    expect(text.indexOf('overcurrent')).toBeLessThan(text.indexOf('state.warning'));
  });

  it('shows no alert at rest', async () => {
    await mount(base());
    openPower();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('renders the countdown from state and cancels it', async () => {
    api.cancelAstralShutdown.mockResolvedValue(base());
    await mount(base({ countdown: cd('overcurrent', 42_000) }));
    openPower();
    expect(screen.getByText(/devices.astral.countdown.overcurrent:\{"left":"0:4\d"\}/)).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByText('devices.astral.cancelShutdown')); });
    expect(api.cancelAstralShutdown).toHaveBeenCalled();
  });

  it('asks before shutting down now', async () => {
    await mount(base({ countdown: cd('critical', 5000) }));
    openPower();
    fireEvent.click(screen.getByText('devices.astral.shutdownNow'));
    expect(api.shutdownAstralNow).not.toHaveBeenCalled();
    api.shutdownAstralNow.mockResolvedValue(base());
    const buttons = screen.getAllByText('devices.astral.shutdownNow');
    await act(async () => { fireEvent.click(buttons[buttons.length - 1]); });
    expect(api.shutdownAstralNow).toHaveBeenCalled();
  });

  it('shows the countdown, held-off and pin alert on the default tab', async () => {
    const s = base({ heldOff: true, countdown: cd('critical', 9000) });
    s.cards[0].pins[0] = { amps: 18, state: 'critical' };
    s.cards[0].state = 'critical';
    await mount(s);
    expect(screen.getByText(/devices.astral.countdown.critical/)).toBeInTheDocument();
    expect(screen.queryByText('devices.astral.cancelShutdown')).toBeNull();
    expect(screen.getByText('devices.astral.heldOff')).toBeInTheDocument();
    expect(screen.getByText(/alertLine.one.*state.critical/)).toBeInTheDocument();
  });

  it('names the card in the alert when there are several', async () => {
    const s = base();
    s.cards.push({ ...s.cards[0], gpuId: 'gpu1', name: 'Second' });
    s.cards[1].state = 'dead';
    s.cards[1].pins[0] = { amps: 0, state: 'dead' };
    await mount(s);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('Second')).toBeInTheDocument();
    expect(alert).toHaveTextContent('devices.astral.alertLine.one');
    expect(alert.textContent).not.toContain('Second: ');
  });

  it('names the card whose countdown it is when there are several', async () => {
    const s = base({ countdown: cd('overcurrent', 30_000, 'gpu1') });
    s.cards.push({ ...s.cards[0], gpuId: 'gpu1', name: 'Second' });
    await mount(s);
    expect(screen.getByText(/^Second: devices.astral.countdown.overcurrent/)).toBeInTheDocument();
  });

  it('counts down from the reply remaining time, not from the client clock', async () => {
    vi.useFakeTimers();
    const skewed = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 3_600_000);
    api.fetchAstral.mockResolvedValue(base({ countdown: { reason: 'overcurrent', endsAtMs: 1, remainingMs: 30_000, gpuId: 'gpu0' } }));
    await act(async () => { render(<AstralDevicePage />); });
    openPower();
    expect(screen.getByText(/"left":"0:30"/)).toBeInTheDocument();
    api.fetchAstral.mockResolvedValue(base({ countdown: { reason: 'overcurrent', endsAtMs: 1, remainingMs: 30_000, gpuId: 'gpu0' } }));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(screen.getByText(/"left":"0:30"/)).toBeInTheDocument();
    api.fetchAstral.mockImplementation(() => new Promise(() => {}));
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    skewed.mockRestore();
    vi.useRealTimers();
    expect(screen.getByText(/"left":"0:2[5-7]"/)).toBeInTheDocument();
  });

  it('says held off while a canceled countdown holds', async () => {
    await mount(base({ heldOff: true }));
    openPower();
    expect(screen.getByText('devices.astral.heldOff')).toBeInTheDocument();
  });

  it('saves a switch turned off at once and a risky one only after the confirmation', async () => {
    api.saveAstralSettings.mockResolvedValue(base());
    const s = base();
    s.settings.alerts = true;
    await mount(s);
    openPower();
    const toggles = screen.getAllByRole('switch');
    await act(async () => { fireEvent.click(toggles[0]); });
    expect(api.saveAstralSettings).toHaveBeenCalledWith({ alerts: false }, expect.anything());

    api.saveAstralSettings.mockClear();
    await act(async () => { fireEvent.click(toggles[1]); });
    expect(api.saveAstralSettings).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByText('devices.astral.turnOn')); });
    expect(api.saveAstralSettings).toHaveBeenCalledWith({ equalizer: true }, expect.anything());
  });

  it('shows sag and lean from the sensors, and calibrating is not no sensor', async () => {
    live.sensors = [
      { id: 'gpu0/astral/level/sag', value: 0.18 },
      { id: 'gpu0/astral/level/lean', value: -0.62 },
    ];
    const s = base();
    s.cards[0].level = { available: false, calibrating: true };
    await mount(s);
    openLevel();
    expect(screen.getByText(/^devices.astral.calibrating:/)).toBeInTheDocument();
    expect(screen.queryByText('devices.astral.noSensor')).toBeNull();
    expect(screen.getByText('+0.18°')).toBeInTheDocument();
    expect(screen.getByText('-0.62°')).toBeInTheDocument();
    expect(screen.getByText('devices.astral.lean.back')).toBeInTheDocument();
  });

  it('handles the service omitting null fields', async () => {
    const s = base();
    delete (s.cards[0].level as { calibratedAtMs?: number }).calibratedAtMs;
    await mount(s);
    openLevel();
    expect(screen.getByText('devices.astral.notCalibrated')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('Invalid');
    expect(screen.queryByText(/devices.astral.countdown/)).toBeNull();
  });

  it('drops a poll reply that lands after its timeout, keeping the newer poll', async () => {
    const releases: ((v: AstralState) => void)[] = [];
    api.fetchAstral
      .mockResolvedValueOnce(base())
      .mockImplementationOnce(() => new Promise<AstralState>(r => { releases.push(r); }))
      .mockResolvedValue(base({ settings: { ...base().settings, alerts: false } }));
    vi.useFakeTimers();
    await act(async () => { render(<AstralDevicePage />); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(11000); });
    openPower();
    expect(screen.getAllByRole('switch')[0]).not.toBeChecked();
    await act(async () => { releases[0](base()); });
    vi.useRealTimers();
    expect(screen.getAllByRole('switch')[0]).not.toBeChecked();
  });

  it('keeps the newer write reply when two writes answer out of order', async () => {
    const releases: ((v: AstralState) => void)[] = [];
    const first = base();
    first.settings.overcurrentShutdown = true;
    api.saveAstralSettings.mockImplementation(() => new Promise<AstralState>(r => { releases.push(r); }));
    await mount(first);
    openPower();
    await act(async () => { fireEvent.click(screen.getAllByRole('switch')[0]); });
    await act(async () => { fireEvent.click(screen.getAllByRole('switch')[2]); });
    expect(releases).toHaveLength(2);
    const newest = base({ settings: { ...first.settings, alerts: false, overcurrentShutdown: false } });
    api.fetchAstral.mockResolvedValue(newest);
    await act(async () => { releases[1](newest); });
    await act(async () => { releases[0](base({ settings: { ...first.settings, alerts: true, overcurrentShutdown: true } })); });
    expect(screen.getAllByRole('switch')[0]).not.toBeChecked();
    expect(screen.getAllByRole('switch')[2]).not.toBeChecked();
  });

  it('surfaces a write that throws', async () => {
    api.saveAstralSettings.mockRejectedValue(new Error('bad json'));
    await mount(base());
    openPower();
    await act(async () => { fireEvent.click(screen.getAllByRole('switch')[0]); });
    expect(screen.getByRole('alert')).toHaveTextContent('devices.astral.failed');
  });

  it('shows the load notice when a poll throws', async () => {
    api.fetchAstral.mockRejectedValue(new Error('bad json'));
    await act(async () => { render(<AstralDevicePage />); });
    expect(screen.getByRole('alert')).toHaveTextContent('devices.astral.loadFailed');
  });

  it('asks before turning on the critical shutdown, saying it cannot be canceled', async () => {
    api.saveAstralSettings.mockResolvedValue(base());
    await mount(base());
    openPower();
    await act(async () => { fireEvent.click(screen.getAllByRole('switch')[3]); });
    expect(api.saveAstralSettings).not.toHaveBeenCalled();
    expect(screen.getByText('devices.astral.confirm.critical.title')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByText('devices.astral.turnOn')); });
    expect(api.saveAstralSettings).toHaveBeenCalledWith({ criticalShutdown: true }, expect.anything());
  });

  it('still shows and acts on a countdown when the state has no fresh cards', async () => {
    api.cancelAstralShutdown.mockResolvedValue(base());
    await mount(base({ cards: [], countdown: cd('overcurrent', 30_000, 'stale') }));
    expect(screen.getByText(/^devices.astral.countdown.overcurrent/)).toBeInTheDocument();
    expect(screen.getByText('devices.astral.noCard')).toBeInTheDocument();
    expect(screen.getByText('devices.astral.shutdownNow')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByText('devices.astral.cancelShutdown')); });
    expect(api.cancelAstralShutdown).toHaveBeenCalled();
  });

  it('offers no cancel for a critical countdown without fresh cards', async () => {
    await mount(base({ cards: [], countdown: cd('critical', 8000, 'stale') }));
    expect(screen.getByText(/^devices.astral.countdown.critical/)).toBeInTheDocument();
    expect(screen.queryByText('devices.astral.cancelShutdown')).toBeNull();
    expect(screen.getByText('devices.astral.shutdownNow')).toBeInTheDocument();
  });

  it('omits the card name when the countdown card is not among several', async () => {
    const s = base({ countdown: cd('overcurrent', 30_000, 'gone') });
    s.cards.push({ ...s.cards[0], gpuId: 'gpu1', name: 'Second' });
    await mount(s);
    expect(screen.getByText(/^devices.astral.countdown.overcurrent/)).toBeInTheDocument();
  });

  it('releases a hung write after the timeout and reports the failure', async () => {
    api.saveAstralSettings.mockImplementation(() => new Promise(() => {}));
    vi.useFakeTimers();
    api.fetchAstral.mockResolvedValue(base());
    await act(async () => { render(<AstralDevicePage />); });
    openPower();
    await act(async () => { fireEvent.click(screen.getAllByRole('switch')[0]); });
    expect(screen.queryByText('devices.astral.failed')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(25100); });
    expect(screen.getByRole('alert')).toHaveTextContent('devices.astral.failed');
    api.fetchAstral.mockResolvedValue(base({ settings: { ...base().settings, equalizer: true } }));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    vi.useRealTimers();
    expect(screen.getAllByRole('switch')[1]).toBeChecked();
  });

  it('does not pile up polls while one hangs, and retries after its timeout', async () => {
    api.fetchAstral.mockImplementation(() => new Promise(() => {}));
    vi.useFakeTimers();
    await act(async () => { render(<AstralDevicePage />); });
    await act(async () => { await vi.advanceTimersByTimeAsync(7000); });
    expect(api.fetchAstral).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    vi.useRealTimers();
    expect(api.fetchAstral).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('alert')).toHaveTextContent('devices.astral.loadFailed');
  });

  it('keeps a loaded page free of the load notice until three polls in a row fail', async () => {
    vi.useFakeTimers();
    api.fetchAstral.mockResolvedValueOnce(base()).mockResolvedValue(null);
    await act(async () => { render(<AstralDevicePage />); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(screen.queryByText('devices.astral.loadFailed')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(screen.queryByText('devices.astral.loadFailed')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(screen.getByText('devices.astral.loadFailed')).toBeInTheDocument();
    api.fetchAstral.mockResolvedValue(base());
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    vi.useRealTimers();
    expect(screen.queryByText('devices.astral.loadFailed')).toBeNull();
  });

  it('drops back to the slow poll on the Power detector tab once no cards remain', async () => {
    vi.useFakeTimers();
    api.fetchAstral.mockResolvedValue(base());
    await act(async () => { render(<AstralDevicePage />); });
    await act(async () => { openPower(); });
    const onPower = api.fetchAstral.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(api.fetchAstral).toHaveBeenCalledTimes(onPower + 1);
    api.fetchAstral.mockResolvedValue(base({ cards: [] }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    const calls = api.fetchAstral.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    vi.useRealTimers();
    expect(api.fetchAstral).toHaveBeenCalledTimes(calls);
  });

  it('shows a countdown that starts while a write is hung', async () => {
    api.saveAstralSettings.mockImplementation(() => new Promise(() => {}));
    vi.useFakeTimers();
    api.fetchAstral.mockResolvedValue(base());
    await act(async () => { render(<AstralDevicePage />); });
    await act(async () => { fireEvent.click(screen.getByText('devices.astral.tab.power')); });
    await act(async () => { fireEvent.click(screen.getAllByRole('switch')[0]); });
    expect(api.saveAstralSettings).toHaveBeenCalled();
    api.fetchAstral.mockResolvedValue(base({ countdown: cd('overcurrent', 30_000) }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    vi.useRealTimers();
    expect(screen.getByText(/devices.astral.countdown.overcurrent/)).toBeInTheDocument();
    expect(screen.getByText('devices.astral.cancelShutdown')).toBeInTheDocument();
  });

  it('polls again at once after a write reply that predates a countdown', async () => {
    let release: (v: AstralState) => void = () => {};
    api.saveAstralSettings.mockImplementation(() => new Promise<AstralState>(r => { release = r; }));
    vi.useFakeTimers();
    api.fetchAstral.mockResolvedValue(base());
    await act(async () => { render(<AstralDevicePage />); });
    await act(async () => { fireEvent.click(screen.getByText('devices.astral.tab.power')); });
    await act(async () => { fireEvent.click(screen.getAllByRole('switch')[0]); });
    expect(api.saveAstralSettings).toHaveBeenCalled();
    api.fetchAstral.mockResolvedValue(base({ countdown: cd('overcurrent', 30_000) }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(screen.getByText(/devices.astral.countdown.overcurrent/)).toBeInTheDocument();
    await act(async () => { release(base()); });
    vi.useRealTimers();
    expect(screen.getByText(/devices.astral.countdown.overcurrent/)).toBeInTheDocument();
  });

  it('clears the load notice when a write succeeds', async () => {
    api.saveAstralSettings.mockResolvedValue(base());
    vi.useFakeTimers();
    api.fetchAstral.mockResolvedValueOnce(base()).mockResolvedValue(null);
    await act(async () => { render(<AstralDevicePage />); });
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(screen.getByText('devices.astral.loadFailed')).toBeInTheDocument();
    openPower();
    await act(async () => { fireEvent.click(screen.getAllByRole('switch')[0]); });
    vi.useRealTimers();
    expect(screen.queryByText('devices.astral.loadFailed')).toBeNull();
  });

  it('aborts the in-flight poll on unmount', async () => {
    let signal: AbortSignal | undefined;
    api.fetchAstral.mockImplementation((sig?: AbortSignal) => { signal = sig; return new Promise(() => {}); });
    let view: ReturnType<typeof render> | undefined;
    await act(async () => { view = render(<AstralDevicePage />); });
    expect(signal?.aborted).toBe(false);
    view?.unmount();
    expect(signal?.aborted).toBe(true);
  });

  it('keeps a write reply over a poll that started before it', async () => {
    let releasePoll: (v: AstralState) => void = () => {};
    api.fetchAstral
      .mockResolvedValueOnce(base())
      .mockImplementationOnce(() => new Promise<AstralState>(r => { releasePoll = r; }));
    api.saveAstralSettings.mockResolvedValue(base({ settings: { ...base().settings, alerts: false } }));
    vi.useFakeTimers();
    await act(async () => { render(<AstralDevicePage />); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    openPower();
    await act(async () => { fireEvent.click(screen.getAllByRole('switch')[0]); });
    await act(async () => { releasePoll(base()); });
    vi.useRealTimers();
    expect(screen.getAllByRole('switch')[0]).not.toBeChecked();
  });

  it('shows a notice and keeps retrying when the state cannot be loaded', async () => {
    vi.useFakeTimers();
    api.fetchAstral.mockResolvedValue(null);
    await act(async () => { render(<AstralDevicePage />); });
    expect(screen.getByRole('alert')).toHaveTextContent('devices.astral.loadFailed');
    api.fetchAstral.mockResolvedValue(base());
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    vi.useRealTimers();
    openPower();
    expect(screen.queryByText('devices.astral.loadFailed')).toBeNull();
    expect(screen.getByRole('group', { name: 'devices.astral.connector' })).toBeInTheDocument();
  });

  it('renders every card', async () => {
    const s = base();
    s.cards.push({ ...s.cards[0], gpuId: 'gpu1', name: 'Second' });
    await mount(s);
    openPower();
    expect(screen.getAllByRole('group', { name: /pinLabel/ })).toHaveLength(12);
    openLevel();
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('says no sensor for a card without level sensing', async () => {
    const s = base();
    s.cards[0].level = { available: false, calibrating: false };
    await mount(s);
    openLevel();
    expect(screen.getByText('devices.astral.noSensor')).toBeInTheDocument();
    expect(screen.queryByText('devices.astral.calibrate')).toBeNull();
  });

  it('calibrates only after the confirmation, for this card', async () => {
    api.calibrateAstral.mockResolvedValue(base());
    await mount(base());
    openLevel();
    fireEvent.click(screen.getByText('devices.astral.calibrate'));
    expect(api.calibrateAstral).not.toHaveBeenCalled();
    const buttons = screen.getAllByText('devices.astral.calibrate');
    await act(async () => { fireEvent.click(buttons[buttons.length - 1]); });
    expect(api.calibrateAstral).toHaveBeenCalledWith('gpu0', expect.anything());
  });

  it('shows a notice when no card is reported', async () => {
    await mount(base({ cards: [] }));
    expect(screen.getByText('devices.astral.noCard')).toBeInTheDocument();
  });
});
