import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SentrySection } from './SentrySection';
import { armSentry, fetchSentry, type SentryState } from '../../../api/sentry';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../../api/service', async (importActual) => ({
  ...(await importActual<typeof import('../../../api/service')>()),
  isRemoteOrigin: false,
  isRemotePaired: false,
}));

vi.mock('../../../api/sentry', () => ({
  fetchSentry: vi.fn(),
  armSentry: vi.fn(),
}));

const state = (patch: Partial<SentryState>): SentryState => ({
  supported: true, armed: false, locked: false, alertPhones: 2, lastAlertAt: null, cooldownSeconds: 3600, ...patch,
});

describe('SentrySection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchSentry).mockResolvedValue(state({}));
  });

  it('renders nothing when the OS has no lock input watch', async () => {
    vi.mocked(fetchSentry).mockResolvedValue(state({ supported: false }));
    const { container } = render(<SentrySection serviceOnline />);
    await waitFor(() => expect(fetchSentry).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('locks and arms from the button and shows the armed state', async () => {
    vi.mocked(armSentry).mockResolvedValue({ ok: true, state: state({ armed: true }) });
    render(<SentrySection serviceOnline />);
    expect(await screen.findByText('sentry.settings.off')).toBeInTheDocument();
    fireEvent.click(screen.getByText('sentry.settings.arm.action'));
    expect(await screen.findByText('sentry.settings.armed')).toBeInTheDocument();
    expect(armSentry).toHaveBeenCalledWith(true);
  });

  it('warns when no phone will get alerts', async () => {
    vi.mocked(fetchSentry).mockResolvedValue(state({ alertPhones: 0 }));
    render(<SentrySection serviceOnline />);
    expect(await screen.findByText('sentry.settings.phones.none')).toBeInTheDocument();
  });

  it('shows the phone count and the hourly note without a warning', async () => {
    render(<SentrySection serviceOnline />);
    expect(await screen.findByText('2')).toBeInTheDocument();
    expect(screen.getByText('sentry.settings.cooldown')).toBeInTheDocument();
    expect(screen.queryByText('sentry.settings.phones.none')).toBeNull();
  });

  it('shows a failure row when arming fails', async () => {
    vi.mocked(armSentry).mockResolvedValue({ ok: false, reason: 'failed' });
    render(<SentrySection serviceOnline />);
    fireEvent.click(await screen.findByText('sentry.settings.arm.action'));
    expect(await screen.findByText('sentry.settings.failed')).toBeInTheDocument();
  });

  it('treats a 403 refusal as a failure', async () => {
    vi.mocked(armSentry).mockResolvedValue({ ok: false, reason: 'failed' });
    render(<SentrySection serviceOnline />);
    fireEvent.click(await screen.findByText('sentry.settings.arm.action'));
    expect(await screen.findByText('sentry.settings.failed')).toBeInTheDocument();
    expect(screen.getByText('sentry.settings.off')).toBeInTheDocument();
  });
});
