import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Nexus2ImportSection } from './Nexus2ImportSection';
import { applyNexus2Import, previewNexus2Import } from '../../../api/migration';
import type { Nexus2ApplyResponse, Nexus2PreviewResponse } from '../../../api/migration';
import styles from './Nexus2ImportSection.module.scss';

vi.mock('../../../api/migration', () => ({
  previewNexus2Import: vi.fn(),
  applyNexus2Import: vi.fn(),
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      if (!params) return key;
      return `${key}:${Object.values(params).join(',')}`;
    },
  }),
}));

const Y70_GROUP_NAME = 'nexus2Welcome.import.group.y70Panel.label';
const Q60_GROUP_NAME = 'nexus2Welcome.import.group.q60Panel.label';
const IMPORT_BUTTON_NAME = 'nexus2Welcome.import.action';

const Y70_LAYOUT = { id: 'y70Layout' as const, available: true, pages: 2, widgets: 6, mappedWidgets: 4, droppedTypes: ['aquarium', 'macros'] };
const APPEARANCE = { id: 'appearance' as const, available: true, accentColor: '#ff0000', background: null };
const GALLERY_WITH_MISSING = { id: 'gallerySources' as const, available: true, count: 5, missing: 3 };
const Q60_FACE = { id: 'q60Face' as const, available: true, face: 'Wave', stashedFaces: 2 };
const WALLPAPERS = { id: 'wallpapers' as const, available: true, count: 7 };
const ROTATION = { id: 'rotation' as const, available: true, value: '180' };
const LANGUAGE = { id: 'language' as const, available: true, value: 'it' };

const FULL_PREVIEW: Nexus2PreviewResponse = {
  available: true,
  profileName: 'Default',
  categories: [Y70_LAYOUT, APPEARANCE, GALLERY_WITH_MISSING, Q60_FACE, WALLPAPERS, ROTATION, LANGUAGE],
};

function renderSection(props: Partial<Parameters<typeof Nexus2ImportSection>[0]> = {}) {
  return render(<Nexus2ImportSection open {...props} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(previewNexus2Import).mockResolvedValue(FULL_PREVIEW);
  vi.mocked(applyNexus2Import).mockResolvedValue({ results: [] });
});

describe('Nexus2ImportSection - grouped preview', () => {
  it('renders nothing when closed', () => {
    render(<Nexus2ImportSection open={false} />);
    expect(screen.queryByText(/nexus2Welcome.import.title/)).not.toBeInTheDocument();
  });

  it('consolidates the six carried wire categories into two group switches, both pre-checked', async () => {
    renderSection();
    const y70 = await screen.findByRole('switch', { name: Y70_GROUP_NAME });
    const q60 = screen.getByRole('switch', { name: Q60_GROUP_NAME });
    expect(y70).toBeChecked();
    expect(q60).toBeChecked();
    // Only the two group switches exist - no per-category rows and no language row.
    expect(screen.getAllByRole('switch')).toHaveLength(2);
  });

  it('never shows a language group, and never sends language on apply', async () => {
    renderSection();
    await screen.findByRole('switch', { name: Y70_GROUP_NAME });
    expect(screen.queryByText(/language/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: IMPORT_BUTTON_NAME }));
    await waitFor(() => expect(applyNexus2Import).toHaveBeenCalledTimes(1));
    const [sentIds] = vi.mocked(applyNexus2Import).mock.calls[0];
    expect(sentIds).not.toContain('language');
  });

  it('hides a group entirely when none of its wire categories are available', async () => {
    vi.mocked(previewNexus2Import).mockResolvedValue({
      available: true,
      profileName: null,
      categories: [APPEARANCE, { id: 'q60Face', available: false, face: null, stashedFaces: 0 }],
    });
    renderSection();
    await screen.findByRole('switch', { name: Y70_GROUP_NAME });
    expect(screen.queryByRole('switch', { name: Q60_GROUP_NAME })).not.toBeInTheDocument();
  });

  it('composes the group detail line from positive per-category parts, joined together', async () => {
    renderSection();
    await screen.findByRole('switch', { name: Y70_GROUP_NAME });
    // y70Layout uses mappedWidgets (4), not the raw widgets count (6); appearance and
    // gallerySources contribute their own positive parts, joined with the app's separator.
    expect(screen.getByText([
      'nexus2Welcome.import.category.y70Layout.detail:2,4',
      'nexus2Welcome.import.category.appearance.detail:#ff0000',
      'nexus2Welcome.import.category.gallerySources.detail:5',
    ].join(' · '))).toBeInTheDocument();
  });

  it('never renders droppedTypes or the gallery missing count anywhere', async () => {
    renderSection();
    await screen.findByRole('switch', { name: Y70_GROUP_NAME });
    expect(screen.queryByText(/aquarium/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/macros/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/droppedHint/)).not.toBeInTheDocument();
    expect(screen.queryByText(/detailWithMissing/)).not.toBeInTheDocument();
    expect(screen.queryByText(/missing/i)).not.toBeInTheDocument();
  });

  it('has an internal scroll container around the switch/results list', async () => {
    renderSection();
    await screen.findByRole('switch', { name: Y70_GROUP_NAME });
    const box = document.querySelector(`.${styles.box}`);
    expect(box).toBeInTheDocument();
  });
});

describe('Nexus2ImportSection - apply, group->wire-id expansion', () => {
  it('unchecking a group drops every one of its wire ids from the apply call', async () => {
    renderSection();
    fireEvent.click(await screen.findByRole('switch', { name: Q60_GROUP_NAME }));
    fireEvent.click(screen.getByRole('button', { name: IMPORT_BUTTON_NAME }));

    await waitFor(() => expect(applyNexus2Import).toHaveBeenCalledTimes(1));
    const [sentIds] = vi.mocked(applyNexus2Import).mock.calls[0];
    expect(sentIds.sort()).toEqual(['appearance', 'gallerySources', 'y70Layout'].sort());
  });

  it('sends every wire id of a checked group', async () => {
    renderSection();
    await screen.findByRole('switch', { name: Y70_GROUP_NAME });
    fireEvent.click(screen.getByRole('button', { name: IMPORT_BUTTON_NAME }));

    await waitFor(() => expect(applyNexus2Import).toHaveBeenCalledTimes(1));
    const [sentIds, replaceFlag] = vi.mocked(applyNexus2Import).mock.calls[0];
    expect(sentIds.sort()).toEqual(['appearance', 'gallerySources', 'q60Face', 'rotation', 'wallpapers', 'y70Layout'].sort());
    // Always replaces - the section's description states that up front, so
    // the service never has to come back asking for confirmation.
    expect(replaceFlag).toBe(true);
  });

  it('disables the apply button once every group is unchecked', async () => {
    renderSection();
    fireEvent.click(await screen.findByRole('switch', { name: Y70_GROUP_NAME }));
    fireEvent.click(screen.getByRole('switch', { name: Q60_GROUP_NAME }));
    expect(screen.getByRole('button', { name: IMPORT_BUTTON_NAME })).toBeDisabled();
  });
});

describe('Nexus2ImportSection - per-group result rollup', () => {
  it('rolls a clean group up to the applied status, with no issue lines', async () => {
    vi.mocked(applyNexus2Import).mockResolvedValue({
      results: [
        { id: 'y70Layout', status: 'applied', detail: null },
        { id: 'appearance', status: 'applied', detail: null },
        { id: 'gallerySources', status: 'skipped', detail: null },
      ],
    });
    renderSection();
    await screen.findByRole('switch', { name: Y70_GROUP_NAME });
    fireEvent.click(screen.getByRole('switch', { name: Q60_GROUP_NAME }));
    fireEvent.click(screen.getByRole('button', { name: IMPORT_BUTTON_NAME }));

    expect(await screen.findByText(Y70_GROUP_NAME)).toBeInTheDocument();
    expect(screen.getByText('nexus2Welcome.import.result.status.applied')).toBeInTheDocument();
  });

  it('a single failed member fails the whole group row, with a per-category detail line', async () => {
    vi.mocked(applyNexus2Import).mockResolvedValue({
      results: [
        { id: 'q60Face', status: 'applied', detail: null },
        { id: 'wallpapers', status: 'failed', detail: 'patch-failed' },
        { id: 'rotation', status: 'applied', detail: null },
      ],
    });
    renderSection();
    await screen.findByRole('switch', { name: Y70_GROUP_NAME });
    fireEvent.click(screen.getByRole('switch', { name: Y70_GROUP_NAME }));
    fireEvent.click(screen.getByRole('button', { name: IMPORT_BUTTON_NAME }));

    expect(await screen.findByText('nexus2Welcome.import.result.status.failed')).toBeInTheDocument();
    expect(screen.getByText([
      'nexus2Welcome.import.result.subDetail:',
      'nexus2Welcome.import.category.wallpapers.label:wallpapers,',
      'nexus2Welcome.import.result.detail.generic:patch-failed',
    ].join(''))).toBeInTheDocument();
  });
});

describe('Nexus2ImportSection - host wiring', () => {
  it('fires onBusyChange around an apply call', async () => {
    let resolveApply: (v: Nexus2ApplyResponse) => void = () => {};
    vi.mocked(applyNexus2Import).mockReturnValue(new Promise(resolve => { resolveApply = resolve; }));
    const onBusyChange = vi.fn();
    renderSection({ onBusyChange });
    await screen.findByRole('switch', { name: Y70_GROUP_NAME });

    fireEvent.click(screen.getByRole('button', { name: IMPORT_BUTTON_NAME }));
    expect(onBusyChange).toHaveBeenLastCalledWith(true);

    resolveApply({ results: [] });
    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(false));
  });

  it('blocks every control while disabled is set by the host', async () => {
    renderSection({ disabled: true });
    const y70 = await screen.findByRole('switch', { name: Y70_GROUP_NAME });
    expect(y70).toBeDisabled();
    expect(screen.getByRole('button', { name: IMPORT_BUTTON_NAME })).toBeDisabled();
  });
});
