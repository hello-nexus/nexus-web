import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AstralState } from '../../../api/astral';
import { AstralDevicePage } from './AstralDevicePage';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
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
vi.mock('../../../hooks/useSensors', () => ({
  useSensors: () => ({ gpuComponents: [{ id: 'gpu0', name: 'GPU', sensors: live.sensors }] }),
}));

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
    expect(screen.getByRole('alert')).toHaveTextContent('devices.astral.alert.overcurrent:{"pins":"3"}');
  });

  it('shows no alert at rest', async () => {
    await mount(base());
    openPower();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('renders the countdown from state and cancels it', async () => {
    api.cancelAstralShutdown.mockResolvedValue(base());
    await mount(base({ countdown: { reason: 'overcurrent', endsAtMs: Date.now() + 42_000 } }));
    openPower();
    expect(screen.getByText(/devices.astral.countdown.overcurrent:\{"left":"0:4\d"\}/)).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByText('devices.astral.cancelShutdown')); });
    expect(api.cancelAstralShutdown).toHaveBeenCalled();
  });

  it('asks before shutting down now', async () => {
    await mount(base({ countdown: { reason: 'critical', endsAtMs: Date.now() + 5000 } }));
    openPower();
    fireEvent.click(screen.getByText('devices.astral.shutdownNow'));
    expect(api.shutdownAstralNow).not.toHaveBeenCalled();
    api.shutdownAstralNow.mockResolvedValue(base());
    const buttons = screen.getAllByText('devices.astral.shutdownNow');
    await act(async () => { fireEvent.click(buttons[buttons.length - 1]); });
    expect(api.shutdownAstralNow).toHaveBeenCalled();
  });

  it('shows the countdown, held-off and pin alert on the default tab', async () => {
    const s = base({ heldOff: true, countdown: { reason: 'critical', endsAtMs: Date.now() + 9000 } });
    s.cards[0].pins[0] = { amps: 18, state: 'critical' };
    s.cards[0].state = 'critical';
    await mount(s);
    expect(screen.getByText(/devices.astral.countdown.critical/)).toBeInTheDocument();
    expect(screen.getByText('devices.astral.cancelShutdown')).toBeInTheDocument();
    expect(screen.getByText('devices.astral.heldOff')).toBeInTheDocument();
    expect(screen.getByText(/devices.astral.alert.critical/)).toBeInTheDocument();
  });

  it('names the card in the alert when there are several', async () => {
    const s = base();
    s.cards.push({ ...s.cards[0], gpuId: 'gpu1', name: 'Second' });
    s.cards[1].state = 'dead';
    s.cards[1].pins[0] = { amps: 0, state: 'dead' };
    await mount(s);
    expect(screen.getByRole('alert')).toHaveTextContent('Second: devices.astral.alert.dead');
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
    expect(api.saveAstralSettings).toHaveBeenCalledWith({ alerts: false });

    api.saveAstralSettings.mockClear();
    await act(async () => { fireEvent.click(toggles[1]); });
    expect(api.saveAstralSettings).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByText('devices.astral.turnOn')); });
    expect(api.saveAstralSettings).toHaveBeenCalledWith({ equalizer: true });
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
    expect(api.calibrateAstral).toHaveBeenCalledWith('gpu0');
  });

  it('shows a notice when no card is reported', async () => {
    await mount(base({ cards: [] }));
    expect(screen.getByText('devices.astral.noCard')).toBeInTheDocument();
  });
});
