import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Nexus2WelcomeScreen } from './Nexus2WelcomeScreen';
import { dismissNexus2Welcome, disableNexus2Autostart } from '../../../api/migration';
import type { Nexus2StatusResponse } from '../../../api/migration';

vi.mock('../../../api/migration', () => ({
  dismissNexus2Welcome: vi.fn(),
  disableNexus2Autostart: vi.fn(),
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
const DISABLE_BUTTON_NAME = 'nexus2Welcome.autostart.action';

const BASE_PAYLOAD: Nexus2StatusResponse = {
  detected: true,
  importAvailable: true,
  deviceEligible: true,
  version: '2.16.0',
  autostartTaskPresent: false,
  pending: true,
};

function renderScreen(payload: Nexus2StatusResponse | null, onComplete = vi.fn()) {
  return render(<Nexus2WelcomeScreen open payload={payload} onComplete={onComplete} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dismissNexus2Welcome).mockResolvedValue({ dismissed: true });
  vi.mocked(disableNexus2Autostart).mockResolvedValue({ error: false, msg: '' });
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

  it('hides the autostart action row when autostartTaskPresent is false', () => {
    renderScreen(BASE_PAYLOAD);
    expect(screen.queryByRole('button', { name: DISABLE_BUTTON_NAME })).not.toBeInTheDocument();
  });

  it('shows the autostart action row when autostartTaskPresent is true', () => {
    renderScreen({ ...BASE_PAYLOAD, autostartTaskPresent: true });
    expect(screen.getByRole('button', { name: DISABLE_BUTTON_NAME })).toBeInTheDocument();
  });
});

describe('Nexus2WelcomeScreen - continue flow', () => {
  it('calls dismissNexus2Welcome and onComplete on Continue', async () => {
    const onComplete = vi.fn();
    renderScreen(BASE_PAYLOAD, onComplete);

    fireEvent.click(screen.getByRole('button', { name: CONTINUE_BUTTON_NAME }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(dismissNexus2Welcome).toHaveBeenCalledTimes(1);
  });

  it('still calls onComplete when the dismiss request fails, so the user is never trapped', async () => {
    vi.mocked(dismissNexus2Welcome).mockResolvedValue(null);
    const onComplete = vi.fn();
    renderScreen(BASE_PAYLOAD, onComplete);

    fireEvent.click(screen.getByRole('button', { name: CONTINUE_BUTTON_NAME }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });
});

describe('Nexus2WelcomeScreen - autostart action', () => {
  function renderWithAutostart(onComplete = vi.fn()) {
    return renderScreen({ ...BASE_PAYLOAD, autostartTaskPresent: true }, onComplete);
  }

  it('disables the button and shows a success line once disableNexus2Autostart succeeds', async () => {
    renderWithAutostart();
    fireEvent.click(screen.getByRole('button', { name: DISABLE_BUTTON_NAME }));

    await waitFor(() => expect(screen.getByText('nexus2Welcome.autostart.success')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: DISABLE_BUTTON_NAME })).toBeDisabled();
  });

  it('shows a non-blocking error line and keeps the button enabled on failure', async () => {
    vi.mocked(disableNexus2Autostart).mockResolvedValue({ error: true, msg: 'nope' });
    renderWithAutostart();
    fireEvent.click(screen.getByRole('button', { name: DISABLE_BUTTON_NAME }));

    await waitFor(() => expect(screen.getByText('nexus2Welcome.autostart.error')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: DISABLE_BUTTON_NAME })).toBeEnabled();
  });

  it('lets the user continue past the screen even after an autostart failure', async () => {
    vi.mocked(disableNexus2Autostart).mockResolvedValue(null);
    const onComplete = vi.fn();
    renderWithAutostart(onComplete);
    fireEvent.click(screen.getByRole('button', { name: DISABLE_BUTTON_NAME }));
    await waitFor(() => expect(screen.getByText('nexus2Welcome.autostart.error')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: CONTINUE_BUTTON_NAME }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });
});
