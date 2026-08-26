import { render, screen, waitFor } from '@testing-library/react';
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

vi.mock('../../../hooks/useUiSettings', () => ({
  useUiSettings: () => ({ settings: uiSettings, update }),
}));

describe('SmartPollSection', () => {
  beforeEach(() => {
    update.mockClear();
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

  it('renders one slider per drive beside the default', async () => {
    render(<SmartPollSection serviceOnline />);
    await waitFor(() => expect(screen.getByLabelText('ST4000DM004')).toBeInTheDocument());
    expect(screen.getByLabelText('Samsung 990 PRO')).toBeInTheDocument();
    expect(screen.getByLabelText('settings.smartPoll.defaultLabel')).toBeInTheDocument();
  });

  it('positions each slider at its own interval, not the index of the value', async () => {
    render(<SmartPollSection serviceOnline />);
    await waitFor(() => expect(screen.getByLabelText('ST4000DM004')).toBeInTheDocument());
    // The slider carries the CHOICE INDEX, so a 30s drive sits at index-of(30).
    expect(screen.getByLabelText('ST4000DM004')).toHaveValue(String(SMART_POLL_CHOICES.indexOf(30)));
    expect(screen.getByLabelText('Samsung 990 PRO')).toHaveValue(String(SMART_POLL_CHOICES.indexOf(1)));
  });

  it('disables the per-drive sliders when one value governs every drive', async () => {
    uiSettings.smartPollPerDrive = false;
    render(<SmartPollSection serviceOnline />);
    await waitFor(() => expect(screen.getByLabelText('ST4000DM004')).toBeInTheDocument());
    expect(screen.getByLabelText('ST4000DM004')).toBeDisabled();
    expect(screen.getByLabelText('settings.smartPoll.defaultLabel')).toBeEnabled();
  });

  it('disables the shared default when each drive is set separately', async () => {
    render(<SmartPollSection serviceOnline />);
    await waitFor(() => expect(screen.getByLabelText('ST4000DM004')).toBeInTheDocument());
    expect(screen.getByLabelText('settings.smartPoll.defaultLabel')).toBeDisabled();
    expect(screen.getByLabelText('ST4000DM004')).toBeEnabled();
  });

  it('keeps Never at the far end of the track', () => {
    expect(SMART_POLL_CHOICES[SMART_POLL_CHOICES.length - 1]).toBe(SMART_POLL_NEVER);
  });

  it('renders nothing but the default row when the service is offline', () => {
    render(<SmartPollSection serviceOnline={false} />);
    expect(fetchSmartPoll).not.toHaveBeenCalled();
    expect(screen.getByLabelText('settings.smartPoll.defaultLabel')).toBeInTheDocument();
  });
});
