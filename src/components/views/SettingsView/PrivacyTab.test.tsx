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

// Records the props the shared ImportDialog was rendered with, so this suite
// can assert on the SAME dialog every import entry point opens without
// re-exercising its internals (covered by ImportCenter.test.tsx).
vi.mock('../../common/ImportCenter/ImportDialog', () => ({
  ImportDialog: ({ open, sources }: { open: boolean; sources: string[] }) => (
    <div data-testid="nexus2-import-dialog" data-open={open ? 'true' : 'false'} data-sources={sources.join(',')} />
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

describe('PrivacyTab - local data store row grouping', () => {
  // Finds the nearest ancestor that contains both nodes, without depending on
  // the CSS module's hashed class names.
  function commonAncestor(a: Element, b: Element): Element {
    let node: Element | null = a;
    while (node) {
      if (node.contains(b)) return node;
      node = node.parentElement;
    }
    throw new Error('no common ancestor');
  }

  it('keeps each row and its own clear-data line out of its siblings\' group, so the section box divider falls between rows', async () => {
    vi.mocked(fetchNexus2Status).mockResolvedValue(status({ importAvailable: false }));
    renderTab();

    const screenTimeLabel = await screen.findByText('settings.screentime.title');
    const fpsLabel = screen.getByText('settings.localDataStore.fps.label');
    const historyLabel = screen.getByText('settings.localDataStore.monitoringHistory.label');
    const clearButtons = screen.getAllByRole('button', { name: 'settings.localDataStore.clearButton' });
    expect(clearButtons).toHaveLength(3);

    const screenTimeGroup = commonAncestor(screenTimeLabel, clearButtons[0]);
    const fpsGroup = commonAncestor(fpsLabel, clearButtons[1]);
    const historyGroup = commonAncestor(historyLabel, clearButtons[2]);

    // Each row's own group holds only that row's label and clear button -
    // the bug had all three rows and clear buttons as siblings of ONE shared
    // box, so this ancestor would have been the box itself for every pair.
    expect(screenTimeGroup.contains(fpsLabel)).toBe(false);
    expect(screenTimeGroup.contains(clearButtons[1])).toBe(false);
    expect(fpsGroup.contains(historyLabel)).toBe(false);
    expect(fpsGroup.contains(clearButtons[2])).toBe(false);

    // The three groups are direct siblings under the same section box, so
    // the box's `> * + *` divider rule lands between them.
    expect(screenTimeGroup.parentElement).toBe(fpsGroup.parentElement);
    expect(fpsGroup.parentElement).toBe(historyGroup.parentElement);
    expect(screenTimeGroup.parentElement?.children).toHaveLength(3);
  });
});

describe('PrivacyTab - shared import dialog reuse', () => {
  it('opens the shared import dialog on the Nexus 2 source, closed by default', async () => {
    vi.mocked(fetchNexus2Status).mockResolvedValue(status());
    renderTab();
    const dialog = await screen.findByTestId('nexus2-import-dialog');
    expect(dialog).toHaveAttribute('data-open', 'false');
    // This row is the Nexus 2 entry, whatever else the dialog can host.
    expect(dialog).toHaveAttribute('data-sources', 'nexus2');

    fireEvent.click(screen.getByRole('button', { name: NEXUS2_OPEN_BUTTON_NAME }));
    expect(dialog).toHaveAttribute('data-open', 'true');
  });
});
