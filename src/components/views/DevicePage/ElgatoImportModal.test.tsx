import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ElgatoImportModal } from './ElgatoImportModal';
import { fetchElgatoProfiles, importElgatoProfile } from '../../../api/streamdeck';
import { createDeckPreset } from '../../../api/deck';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}));

vi.mock('../../../api/streamdeck', () => ({
  fetchElgatoProfiles: vi.fn(),
  importElgatoProfile: vi.fn(),
}));

vi.mock('../../../api/deck', () => ({
  createDeckPreset: vi.fn(),
}));

const PROFILE_A = { id: 'p1', name: 'Default Profile', model: '20GAA9901', modelLabel: 'Stream Deck MK.2', pageCount: 2, keyCount: 15 };

function renderModal(overrides: Partial<Parameters<typeof ElgatoImportModal>[0]> = {}) {
  const onClose = vi.fn();
  const onImported = vi.fn();
  const utils = render(
    <ElgatoImportModal
      open
      onClose={onClose}
      deckCols={5}
      deckRows={3}
      existingPresetNames={[]}
      onImported={onImported}
      {...overrides}
    />,
  );
  return { ...utils, onClose, onImported };
}

beforeEach(() => { vi.clearAllMocks(); });

describe('ElgatoImportModal states', () => {
  it('shows a loading state before the fetch resolves', () => {
    vi.mocked(fetchElgatoProfiles).mockReturnValue(new Promise(() => {}));
    renderModal();
    expect(screen.getByRole('img')).toBeInTheDocument(); // Spinner's svg role="img"
  });

  it('shows the notFound empty state', async () => {
    vi.mocked(fetchElgatoProfiles).mockResolvedValue({ status: 'notFound', profiles: [] });
    renderModal();
    expect(await screen.findByText('devices.streamdeck.import.notFoundTitle')).toBeInTheDocument();
    expect(screen.getByText('devices.streamdeck.import.notFoundBody')).toBeInTheDocument();
  });

  it('shows the unsupportedVersion empty state', async () => {
    vi.mocked(fetchElgatoProfiles).mockResolvedValue({ status: 'unsupportedVersion', profiles: [] });
    renderModal();
    expect(await screen.findByText('devices.streamdeck.import.unsupportedTitle')).toBeInTheDocument();
  });

  it('shows a network-error state when the request fails outright', async () => {
    vi.mocked(fetchElgatoProfiles).mockResolvedValue(null);
    renderModal();
    expect(await screen.findByText('devices.streamdeck.import.errorTitle')).toBeInTheDocument();
  });

  it('shows an empty-list state when the store has zero profiles', async () => {
    vi.mocked(fetchElgatoProfiles).mockResolvedValue({ status: 'ok', profiles: [] });
    renderModal();
    expect(await screen.findByText('devices.streamdeck.import.emptyTitle')).toBeInTheDocument();
  });

  it('lists profiles with their model and page/key summary', async () => {
    vi.mocked(fetchElgatoProfiles).mockResolvedValue({ status: 'ok', profiles: [PROFILE_A] });
    renderModal();
    expect(await screen.findByText('Default Profile')).toBeInTheDocument();
    expect(screen.getByText(/Stream Deck MK\.2/)).toBeInTheDocument();
  });
});

describe('ElgatoImportModal import flow', () => {
  it('imports the selected profile, creates a preset from it, and reports the result', async () => {
    vi.mocked(fetchElgatoProfiles).mockResolvedValue({ status: 'ok', profiles: [PROFILE_A] });
    const config = { pages: [{ slots: [] }] };
    const report = {
      totalKeys: 15,
      mappedKeys: 12,
      unmapped: [{ page: 1, position: '2,1', name: 'CPU Load', reason: 'plugin' as const }],
    };
    vi.mocked(importElgatoProfile).mockResolvedValue({ config, report });
    vi.mocked(createDeckPreset).mockResolvedValue({ id: 'new1', name: 'Default Profile', cols: 5, rows: 3, pageCount: 1, deck: config });

    const { onImported } = renderModal();
    fireEvent.click(await screen.findByText('Default Profile'));
    fireEvent.click(screen.getByText('devices.streamdeck.import.import'));

    await waitFor(() => expect(createDeckPreset).toHaveBeenCalledWith({ name: 'Default Profile', cols: 5, rows: 3, deck: config }));
    expect(importElgatoProfile).toHaveBeenCalledWith('p1');
    expect(onImported).toHaveBeenCalledTimes(1);

    expect(await screen.findByText('devices.streamdeck.import.resultTitle')).toBeInTheDocument();
    expect(screen.getByText(`devices.streamdeck.import.mappedSummary:${JSON.stringify({ mapped: 12, total: 15 })}`)).toBeInTheDocument();
    expect(screen.getByText('CPU Load')).toBeInTheDocument();
    expect(screen.getByText('devices.streamdeck.import.reason.plugin')).toBeInTheDocument();
  });

  it('dedupes the created preset name against existing presets', async () => {
    vi.mocked(fetchElgatoProfiles).mockResolvedValue({ status: 'ok', profiles: [PROFILE_A] });
    vi.mocked(importElgatoProfile).mockResolvedValue({ config: { pages: [{ slots: [] }] }, report: { totalKeys: 1, mappedKeys: 1, unmapped: [] } });
    vi.mocked(createDeckPreset).mockResolvedValue({ id: 'new1', name: 'Default Profile (2)', cols: 5, rows: 3, pageCount: 1, deck: { pages: [{ slots: [] }] } });

    renderModal({ existingPresetNames: ['Default Profile'] });
    fireEvent.click(await screen.findByText('Default Profile'));
    fireEvent.click(screen.getByText('devices.streamdeck.import.import'));

    await waitFor(() => expect(createDeckPreset).toHaveBeenCalledWith(expect.objectContaining({ name: 'Default Profile (2)' })));
  });

  it('shows an inline error and stays on the list when import fails', async () => {
    vi.mocked(fetchElgatoProfiles).mockResolvedValue({ status: 'ok', profiles: [PROFILE_A] });
    vi.mocked(importElgatoProfile).mockResolvedValue(null);

    renderModal();
    fireEvent.click(await screen.findByText('Default Profile'));
    fireEvent.click(screen.getByText('devices.streamdeck.import.import'));

    expect(await screen.findByText('devices.streamdeck.import.importFailed')).toBeInTheDocument();
    expect(createDeckPreset).not.toHaveBeenCalled();
  });

  it('disables Import until a profile is selected', async () => {
    vi.mocked(fetchElgatoProfiles).mockResolvedValue({ status: 'ok', profiles: [PROFILE_A] });
    renderModal();
    await screen.findByText('Default Profile');
    expect(screen.getByText('devices.streamdeck.import.import').closest('button')).toBeDisabled();
  });
});
