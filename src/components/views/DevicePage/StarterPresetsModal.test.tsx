import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { StarterPresetsModal } from './StarterPresetsModal';
import { createDeckPreset, getDeckTemplates, type DeckPresetFull, type DeckTemplate } from '../../../api/deck';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}));

vi.mock('../../../api/deck', () => ({
  createDeckPreset: vi.fn(),
  getDeckTemplates: vi.fn(),
}));

const DISCORD: DeckTemplate = { id: 'discord', name: 'Discord', description: '', cols: 5, rows: 3, match: { processNames: [], displayNames: [] } };
const SLACK: DeckTemplate = { id: 'slack', name: 'Slack', description: '', cols: 5, rows: 3, match: { processNames: [], displayNames: [] } };
const created = (id: string, name: string): DeckPresetFull => ({ id, name, cols: 5, rows: 3, pageCount: 1, deck: { pages: [{ slots: [] }] } });

function renderModal(overrides: Partial<Parameters<typeof StarterPresetsModal>[0]> = {}) {
  const onClose = vi.fn();
  const onImported = vi.fn();
  const utils = render(
    <StarterPresetsModal open onClose={onClose} presetCount={0} addedTemplateIds={[]} onImported={onImported} {...overrides} />,
  );
  return { ...utils, onClose, onImported };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDeckTemplates).mockResolvedValue([DISCORD, SLACK]);
});

describe('StarterPresetsModal', () => {
  it('shows a spinner, not a partial list, until the templates load', () => {
    vi.mocked(getDeckTemplates).mockReturnValue(new Promise(() => {}));
    renderModal();
    expect(screen.getByRole('img')).toBeInTheDocument(); // Spinner's svg role="img"
    expect(screen.queryByRole('button', { name: /Discord/ })).toBeNull();
  });

  it('lists every starter, tagging ones already added but leaving them addable', async () => {
    renderModal({ addedTemplateIds: ['discord'] });
    expect(await screen.findByText('Slack')).toBeInTheDocument();
    expect(screen.getAllByText('devices.streamdeck.import.added')).toHaveLength(1);
    expect(screen.getByText('Discord').closest('button')).not.toBeDisabled();
  });

  it('creates the preset from the starter in one press, activates it, and closes', async () => {
    vi.mocked(createDeckPreset).mockResolvedValue(created('new1', 'Discord'));
    const { onImported, onClose } = renderModal({ addedTemplateIds: ['discord'] });
    fireEvent.click(await screen.findByText('Discord'));
    await waitFor(() => expect(onImported).toHaveBeenCalledWith('new1'));
    expect(createDeckPreset).toHaveBeenCalledWith({ name: 'Discord', cols: 5, rows: 3, templateId: 'discord' });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows an inline error and stays open when the create fails', async () => {
    vi.mocked(createDeckPreset).mockResolvedValue(null);
    const { onImported, onClose } = renderModal();
    fireEvent.click(await screen.findByText('Slack'));
    expect(await screen.findByText('panel.settings.deck.presets.createFailed')).toBeInTheDocument();
    expect(onImported).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows an empty state when no templates come back', async () => {
    vi.mocked(getDeckTemplates).mockResolvedValue([]);
    renderModal();
    expect(await screen.findByText('devices.streamdeck.import.startersEmpty')).toBeInTheDocument();
  });

  it('disables the starters at the deck preset cap, not the lighting one', async () => {
    const { unmount } = renderModal({ presetCount: 10 });
    expect((await screen.findByText('Slack')).closest('button')).not.toBeDisabled();
    unmount();
    renderModal({ presetCount: 50 });
    expect((await screen.findByText('Slack')).closest('button')).toBeDisabled();
  });
});
