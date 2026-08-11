import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrivacyTab } from './PrivacyTab';
import { fetchNexus2Status } from '../../../api/migration';
import { getDefaultSettings } from '../../../lib/settings';
import type { Nexus2StatusResponse } from '../../../api/migration';

vi.mock('../../../api/service', () => ({
  fetchService: vi.fn().mockResolvedValue(null),
  postService: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../api/migration', () => ({
  fetchNexus2Status: vi.fn(),
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../ScreenTimeBrowse/ScreenTimeDataControl', () => ({
  ScreenTimeDataControl: () => null,
}));

vi.mock('./AiIntegrationSection', () => ({
  AiIntegrationSection: () => null,
}));

// Records the props Nexus2ImportDialog was rendered with, so this suite can
// assert on the SAME dialog component PrivacyTab reuses without re-exercising
// its internals (covered by Nexus2ImportSection.test.tsx).
vi.mock('../../common/Nexus2WelcomeScreen/Nexus2ImportDialog', () => ({
  Nexus2ImportDialog: ({ open }: { open: boolean }) => (
    <div data-testid="nexus2-import-dialog" data-open={open ? 'true' : 'false'} />
  ),
}));

const NEXUS2_ROW_LABEL = 'nexus2Welcome.settingsEntry.rowLabel';
const NEXUS2_OPEN_BUTTON_NAME = 'nexus2Welcome.settingsEntry.openButton';

function status(overrides: Partial<Nexus2StatusResponse> = {}): Nexus2StatusResponse {
  return {
    detected: true,
    importAvailable: true,
    deviceEligible: true,
    version: '2.16.0',
    autostartTaskPresent: false,
    running: false,
    pending: false,
    ...overrides,
  };
}

function renderTab(serviceOnline = true) {
  return render(<PrivacyTab settings={getDefaultSettings()} serviceOnline={serviceOnline} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PrivacyTab - Nexus 2 import entry visibility', () => {
  it('is hidden while the status fetch is pending', () => {
    vi.mocked(fetchNexus2Status).mockReturnValue(new Promise(() => {}));
    renderTab();
    expect(screen.queryByText(NEXUS2_ROW_LABEL)).not.toBeInTheDocument();
  });

  it('is hidden when the fetch fails (null response)', async () => {
    vi.mocked(fetchNexus2Status).mockResolvedValue(null);
    renderTab();
    await waitFor(() => expect(fetchNexus2Status).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(NEXUS2_ROW_LABEL)).not.toBeInTheDocument();
  });

  it('is hidden when detected is true but importAvailable is false', async () => {
    vi.mocked(fetchNexus2Status).mockResolvedValue(status({ detected: true, importAvailable: false }));
    renderTab();
    await waitFor(() => expect(fetchNexus2Status).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(NEXUS2_ROW_LABEL)).not.toBeInTheDocument();
  });

  // Nexus 2 uninstalled, its config.json left behind: the returning-user
  // screen stays shut (service reports detected false) and this row is the
  // only way to reach the import.
  it('shows the row when importAvailable is true and detected is false', async () => {
    vi.mocked(fetchNexus2Status).mockResolvedValue(status({ detected: false, importAvailable: true }));
    renderTab();
    expect(await screen.findByText(NEXUS2_ROW_LABEL)).toBeInTheDocument();
  });

  it('shows the row when Nexus 2 is still installed and importable', async () => {
    vi.mocked(fetchNexus2Status).mockResolvedValue(status({ detected: true, importAvailable: true }));
    renderTab();
    expect(await screen.findByText(NEXUS2_ROW_LABEL)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: NEXUS2_OPEN_BUTTON_NAME })).toBeInTheDocument();
  });

  it('does not fetch while the service is offline', () => {
    renderTab(false);
    expect(fetchNexus2Status).not.toHaveBeenCalled();
  });
});

describe('PrivacyTab - Nexus 2 import dialog reuse', () => {
  it('opens the shared Nexus2ImportDialog on click, closed by default', async () => {
    vi.mocked(fetchNexus2Status).mockResolvedValue(status());
    renderTab();
    const dialog = await screen.findByTestId('nexus2-import-dialog');
    expect(dialog).toHaveAttribute('data-open', 'false');

    fireEvent.click(screen.getByRole('button', { name: NEXUS2_OPEN_BUTTON_NAME }));
    expect(dialog).toHaveAttribute('data-open', 'true');
  });
});
