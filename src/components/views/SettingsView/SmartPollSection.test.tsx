import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SmartPollSection } from './SmartPollSection';
import { fetchSmartPoll, SMART_POLL_CHOICES, SMART_POLL_NEVER } from '../../../api/smartPoll';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      let text = key;
      if (params) for (const [k, v] of Object.entries(params)) text += ` ${k}=${v}`;
      return text;
    },
  }),
}));

vi.mock('../../../api/smartPoll', async (importActual) => ({
  ...(await importActual<typeof import('../../../api/smartPoll')>()),
  fetchSmartPoll: vi.fn(),
}));

const update = vi.fn();
const uiSettings = { smartPollSeconds: {} as Record<string, number>, smartPollDefaultSeconds: 30, smartPollPerDrive: true };

const pillars = vi.hoisted(() => ({ monitoring: true, diagnostics: true, cooling: true }));
vi.mock('../../../hooks/useUiSettings', () => ({
  useUiSettings: () => ({ settings: uiSettings, update }),
  useFeatureFlags: () => ({ lighting: true, ...pillars }),
}));
const topic = vi.hoisted(() => ({ cbs: {} as Record<string, () => void> }));
vi.mock('../../../hooks/useMultiplexSocket', () => ({ useTopicCallback: (name: string, _e: boolean, cb: () => void) => { topic.cbs[name] = cb; } }));

describe('SmartPollSection', () => {
  beforeEach(() => {
    update.mockClear();
    Object.assign(pillars, { monitoring: true, diagnostics: true, cooling: true });
    vi.mocked(fetchSmartPoll).mockClear();
    uiSettings.smartPollSeconds = {};
    uiSettings.smartPollDefaultSeconds = 30;
    uiSettings.smartPollPerDrive = true;
    vi.mocked(fetchSmartPoll).mockResolvedValue({
      defaultSeconds: 30,
      perDrive: true,
      choices: SMART_POLL_CHOICES,
      drives: [
        { id: '/hdd/0', name: 'ST4000DM004', seconds: 30, usesDefault: true, rotational: true },
        { id: '/nvme/0', name: 'Samsung 990 PRO', seconds: 1, usesDefault: true, rotational: false },
      ],
    });
  });

  it('renders only the shared default, with no per-drive list or switch', async () => {
    render(<SmartPollSection serviceOnline />);
    await waitFor(() => expect(screen.getByLabelText('settings.smartPoll.defaultLabel')).toBeInTheDocument());
    expect(screen.queryByLabelText('ST4000DM004')).toBeNull();
    expect(screen.queryByLabelText('Samsung 990 PRO')).toBeNull();
    expect(screen.queryByText('settings.smartPoll.perDriveLabel')).toBeNull();
  });

  it('keeps the shared default editable even when a drive is set apart', async () => {
    render(<SmartPollSection serviceOnline />);
    await waitFor(() => expect(screen.getByLabelText('settings.smartPoll.defaultLabel')).toBeEnabled());
  });

  it('moves the drives following the default and leaves the one set apart', async () => {
    uiSettings.smartPollSeconds = { '/hdd/0': 30, '/nvme/0': 5 };
    render(<SmartPollSection serviceOnline />);
    const slider = await screen.findByLabelText('settings.smartPoll.defaultLabel');
    fireEvent.change(slider, { target: { value: String(SMART_POLL_CHOICES.indexOf(60)) } });
    expect(update).toHaveBeenCalledWith({
      smartPollSeconds: { '/hdd/0': 60, '/nvme/0': 5 },
      smartPollDefaultSeconds: 60,
      smartPollPerDrive: true,
    });
  });

  it('keeps Never at the far end of the track', () => {
    expect(SMART_POLL_CHOICES[SMART_POLL_CHOICES.length - 1]).toBe(SMART_POLL_NEVER);
  });

  it('renders nothing but the default row when the service is offline', () => {
    render(<SmartPollSection serviceOnline={false} />);
    expect(fetchSmartPoll).not.toHaveBeenCalled();
    expect(screen.getByLabelText('settings.smartPoll.defaultLabel')).toBeInTheDocument();
  });

  it('hides the rows behind a notice when the service reports polling inactive', async () => {
    vi.mocked(fetchSmartPoll).mockResolvedValue({ defaultSeconds: 30, perDrive: true, choices: SMART_POLL_CHOICES, drives: [], active: false });
    render(<SmartPollSection serviceOnline />);
    expect(await screen.findByText('settings.pillarOff.smartPoll')).toBeInTheDocument();
    expect(screen.queryByLabelText('settings.smartPoll.defaultLabel')).toBeNull();
  });

  it('keeps the rows when the service reports polling active, even with both pillars off', async () => {
    Object.assign(pillars, { monitoring: false, diagnostics: false });
    vi.mocked(fetchSmartPoll).mockResolvedValue({ defaultSeconds: 30, perDrive: true, choices: SMART_POLL_CHOICES, drives: [], active: true });
    render(<SmartPollSection serviceOnline />);
    await waitFor(() => expect(screen.queryByText('settings.pillarOff.smartPoll')).toBeNull());
    expect(screen.getByLabelText('settings.smartPoll.defaultLabel')).toBeInTheDocument();
  });

  it('keeps the rows when the service omits the flag, whatever the pillars', async () => {
    Object.assign(pillars, { monitoring: false, diagnostics: false });
    render(<SmartPollSection serviceOnline />);
    await waitFor(() => expect(screen.getByLabelText('settings.smartPoll.defaultLabel')).toBeInTheDocument());
    expect(screen.queryByText('settings.pillarOff.smartPoll')).toBeNull();
  });

  it('shows neither the rows nor the notice until the first answer arrives', async () => {
    let answer!: (v: Awaited<ReturnType<typeof fetchSmartPoll>>) => void;
    vi.mocked(fetchSmartPoll).mockReturnValue(new Promise(r => { answer = r; }));
    render(<SmartPollSection serviceOnline />);
    expect(screen.queryByLabelText('settings.smartPoll.defaultLabel')).toBeNull();
    expect(screen.queryByText('settings.pillarOff.smartPoll')).toBeNull();
    answer({ defaultSeconds: 30, perDrive: true, choices: SMART_POLL_CHOICES, drives: [], active: false });
    expect(await screen.findByText('settings.pillarOff.smartPoll')).toBeInTheDocument();
  });

  it('refetches on the preferences topic, not when a pillar flips locally', async () => {
    const view = render(<SmartPollSection serviceOnline />);
    await waitFor(() => expect(fetchSmartPoll).toHaveBeenCalledTimes(1));
    Object.assign(pillars, { monitoring: false });
    view.rerender(<SmartPollSection serviceOnline />);
    expect(fetchSmartPoll).toHaveBeenCalledTimes(1);
    vi.mocked(fetchSmartPoll).mockResolvedValue({ defaultSeconds: 30, perDrive: true, choices: SMART_POLL_CHOICES, drives: [], active: false });
    topic.cbs.prefs();
    expect(await screen.findByText('settings.pillarOff.smartPoll')).toBeInTheDocument();
    expect(fetchSmartPoll).toHaveBeenCalledTimes(2);
  });

  it('refetches when the service pings the smart-poll topic', async () => {
    render(<SmartPollSection serviceOnline />);
    await waitFor(() => expect(fetchSmartPoll).toHaveBeenCalledTimes(1));
    vi.mocked(fetchSmartPoll).mockResolvedValue({ defaultSeconds: 30, perDrive: true, choices: SMART_POLL_CHOICES, drives: [], active: false });
    topic.cbs['smart-poll']();
    expect(await screen.findByText('settings.pillarOff.smartPoll')).toBeInTheDocument();
  });

  it('lets only the latest read land when pings overlap', async () => {
    const answers: Array<(v: Awaited<ReturnType<typeof fetchSmartPoll>>) => void> = [];
    vi.mocked(fetchSmartPoll).mockImplementation(() => new Promise(r => { answers.push(r); }));
    render(<SmartPollSection serviceOnline />);
    topic.cbs.prefs();
    const reply = (active: boolean) => ({ defaultSeconds: 30, perDrive: true, choices: SMART_POLL_CHOICES, drives: [], active });
    await waitFor(() => expect(answers).toHaveLength(2));
    answers[1](reply(true));
    await waitFor(() => expect(screen.getByLabelText('settings.smartPoll.defaultLabel')).toBeInTheDocument());
    answers[0](reply(false));
    await Promise.resolve();
    expect(screen.queryByText('settings.pillarOff.smartPoll')).toBeNull();
  });
});
