import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Nexus2ImportSection, type Nexus2ImportHandle } from './Nexus2ImportSection';
import { applyNexus2Import, previewNexus2Import } from '../../../api/migration';
import type { Nexus2ApplyResponse, Nexus2PreviewResponse } from '../../../api/migration';
import styles from './Nexus2ImportSection.module.scss';

vi.mock('../../../api/migration', () => ({
  previewNexus2Import: vi.fn(),
  applyNexus2Import: vi.fn(),
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    language: 'en',
    t: (key: string, params?: Record<string, string | number>) => {
      // Deliberately unlike any hardcoded separator: the locale template must win.
      if (key.endsWith('.fanCurves.curve')) return '{name} \u21D2 {fans}';
      if (key.endsWith('.fanCurves.reasonLine')) return '{name}\uFF1A{reason}';
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

  it('lists each positive per-category part as its own bullet under the group', async () => {
    renderSection();
    await screen.findByRole('switch', { name: Y70_GROUP_NAME });
    // y70Layout uses mappedWidgets (4), not the raw widgets count (6).
    const [y70List] = screen.getAllByRole('list');
    expect(within(y70List).getAllByRole('listitem').map(li => li.textContent)).toEqual([
      'nexus2Welcome.import.category.y70Layout.detail:2,4',
      'nexus2Welcome.import.category.appearance.detail:#ff0000',
      'nexus2Welcome.import.category.gallerySources.detail:5',
    ]);
  });

  it('picks the plural form for the background, wallpaper and slideshow counts', async () => {
    vi.mocked(previewNexus2Import).mockResolvedValue({
      available: true,
      profileName: null,
      categories: [{ ...APPEARANCE, count: 1 }, { ...WALLPAPERS, count: 20, slideshowIntervalSec: 5 }],
    });
    renderSection();
    await screen.findByRole('switch', { name: Y70_GROUP_NAME });
    const [y70List, q60List] = screen.getAllByRole('list');
    expect(within(y70List).getByText('nexus2Welcome.import.category.appearance.backgrounds.one:1')).toBeInTheDocument();
    expect(within(q60List).getAllByRole('listitem').map(li => li.textContent)).toEqual([
      'nexus2Welcome.import.category.wallpapers.detail.other:20',
      'nexus2Welcome.import.category.wallpapers.slideshow.other:5',
    ]);
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

describe('Nexus2ImportSection - fan curves', () => {
  const FAN_NAME = 'nexus2Welcome.import.group.fanCurves.label';
  const FAN = 'nexus2Welcome.import.category.fanCurves';
  const FAN_CATEGORY = {
    id: 'fanCurves' as const,
    available: true,
    count: 1,
    otherProfiles: 2,
    fanCurves: [{
      name: 'Quiet', kind: 'graph' as const, status: 'import' as const, minimumRaised: false,
      targets: [
        { label: 'Front', status: 'import' as const },
        { label: 'Pump', status: 'skip' as const, reason: 'pumpKept' },
        { label: 'Odd', status: 'skip' as const, reason: 'futureCode' },
      ],
    }],
  };

  it('pre-checks the group and lists curves, skipped targets and the profile line', async () => {
    vi.mocked(previewNexus2Import).mockResolvedValue({ available: true, profileName: null, categories: [FAN_CATEGORY] });
    renderSection();
    const fan = await screen.findByRole('switch', { name: FAN_NAME });
    expect(fan).toBeChecked();
    expect(screen.getByText('Quiet \u21D2 Front')).toBeInTheDocument();
    expect(screen.getByText(`Pump\uFF1A${FAN}.reason.pumpKept`)).toBeInTheDocument();
    expect(screen.getByText(`Odd\uFF1A${FAN}.reason.unknown`)).toBeInTheDocument();
    expect(screen.getByText(`${FAN}.otherProfiles:`)).toBeInTheDocument();
  });

  it('titles the section for fan curves only, and for both groups', async () => {
    vi.mocked(previewNexus2Import).mockResolvedValue({ available: true, profileName: null, categories: [FAN_CATEGORY] });
    const first = renderSection();
    await screen.findByRole('switch', { name: FAN_NAME });
    expect(screen.getByText('nexus2Welcome.import.description.fanCurves')).toBeInTheDocument();
    first.unmount();
    vi.mocked(previewNexus2Import).mockResolvedValue({ available: true, profileName: null, categories: [Y70_LAYOUT, FAN_CATEGORY] });
    renderSection();
    await screen.findByRole('switch', { name: FAN_NAME });
    expect(screen.getByText('nexus2Welcome.import.description.both')).toBeInTheDocument();
  });

  it('renders curve and fan names verbatim, even when they look like placeholders', async () => {
    vi.mocked(previewNexus2Import).mockResolvedValue({
      available: true, profileName: null,
      categories: [{
        ...FAN_CATEGORY,
        fanCurves: [{ name: '{fans} $&', kind: 'graph' as const, status: 'import' as const, minimumRaised: false, targets: [{ label: '{name} $1', status: 'import' as const }] }],
      }],
    });
    renderSection();
    await screen.findByRole('switch', { name: FAN_NAME });
    expect(screen.getByText('{fans} $& \u21D2 {name} $1')).toBeInTheDocument();
  });

  it('shows an all-skipped group disabled, with each curve reason and no import', async () => {
    vi.mocked(previewNexus2Import).mockResolvedValue({
      available: true, profileName: null,
      categories: [{
        id: 'fanCurves', available: false, count: 0,
        fanCurves: [{ name: 'Turbo', kind: 'linear', status: 'skip', reason: 'unsafeCurve', minimumRaised: false, targets: [] }],
      }],
    });
    renderSection();
    const fan = await screen.findByRole('switch', { name: FAN_NAME });
    expect(fan).toBeDisabled();
    expect(fan).not.toBeChecked();
    expect(screen.getByText(`Turbo\uFF1A${FAN}.reason.unsafeCurve`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: IMPORT_BUTTON_NAME })).toBeDisabled();
  });

  it('asks for a review until the fan curve list has been on screen', async () => {
    vi.mocked(previewNexus2Import).mockResolvedValue({ available: true, profileName: null, categories: [Y70_LAYOUT, FAN_CATEGORY] });
    const handleRef = { current: null as Nexus2ImportHandle | null };
    renderSection({ handleRef, showAction: false });
    expect(handleRef.current?.fanCurvesNeedReview()).toBe(false);
    await screen.findByRole('switch', { name: FAN_NAME });
    // Without an IntersectionObserver a passive effect marks the list seen, after the switch renders.
    await waitFor(() => expect(handleRef.current?.fanListSeen()).toBe(true));
    expect(handleRef.current?.fanCurvesNeedReview()).toBe(false);
    // A press that preceded the preview never counts, even though the list shows now.
    expect(handleRef.current?.fanCurvesNeedReview(true)).toBe(true);
    // Unticked fan curves need no review.
    fireEvent.click(screen.getByRole('switch', { name: FAN_NAME }));
    expect(handleRef.current?.fanCurvesNeedReview(true)).toBe(false);
  });

  it('does not count the list as shown while the host hides the panel', async () => {
    vi.mocked(previewNexus2Import).mockResolvedValue({ available: true, profileName: null, categories: [FAN_CATEGORY] });
    const handleRef = { current: null as Nexus2ImportHandle | null };
    const view = renderSection({ handleRef, showAction: false, visible: false });
    await screen.findByRole('switch', { name: FAN_NAME });
    expect(handleRef.current?.fanCurvesNeedReview()).toBe(true);
    view.rerender(<Nexus2ImportSection open showAction={false} handleRef={handleRef} visible />);
    expect(handleRef.current?.fanCurvesNeedReview()).toBe(false);
  });

  it('keeps locale punctuation from the template around user text', async () => {
    vi.mocked(previewNexus2Import).mockResolvedValue({ available: true, profileName: null, categories: [FAN_CATEGORY] });
    renderSection();
    await screen.findByRole('switch', { name: FAN_NAME });
    expect(screen.getByText(`Pump\uFF1A${FAN}.reason.pumpKept`)).toBeInTheDocument();
    expect(screen.getByText('Quiet \u21D2 Front')).toBeInTheDocument();
  });

  describe('with a viewport observer', () => {
    type Entry = { target: Element; isIntersecting: boolean };
    const observers: Array<{ cb: (e: Entry[]) => void; target: Element | null; disconnected: boolean }> = [];
    beforeEach(() => {
      observers.length = 0;
      vi.stubGlobal('IntersectionObserver', class {
        record: { cb: (e: Entry[]) => void; target: Element | null; disconnected: boolean } = { cb: () => {}, target: null, disconnected: false };
        constructor(cb: (e: Entry[]) => void) { this.record.cb = cb; observers.push(this.record); }
        observe(el: Element) { this.record.target = el; }
        disconnect() { this.record.disconnected = true; }
      });
    });
    afterEach(() => { vi.unstubAllGlobals(); });
    // The observer is registered by a passive effect that can run after the switch appears.
    const enterViewport = async () => {
      await waitFor(() => expect(observers.some(o => !o.disconnected && o.target)).toBe(true));
      act(() => {
        for (const o of observers) if (!o.disconnected && o.target) o.cb([{ target: o.target, isIntersecting: true }]);
      });
    };

    it('counts the list as seen only once it enters the viewport', async () => {
      vi.mocked(previewNexus2Import).mockResolvedValue({ available: true, profileName: null, categories: [FAN_CATEGORY] });
      const handleRef = { current: null as Nexus2ImportHandle | null };
      renderSection({ handleRef, showAction: false });
      await screen.findByRole('switch', { name: FAN_NAME });
      expect(handleRef.current?.fanListSeen()).toBe(false);
      expect(handleRef.current?.fanCurvesNeedReview()).toBe(true);
      await enterViewport();
      expect(handleRef.current?.fanListSeen()).toBe(true);
      expect(handleRef.current?.fanCurvesNeedReview()).toBe(false);
    });

    it('never carries seen over to a newly loaded preview', async () => {
      vi.mocked(previewNexus2Import).mockImplementation(async () => ({ available: true, profileName: null, categories: [FAN_CATEGORY] }));
      const handleRef = { current: null as Nexus2ImportHandle | null };
      const view = render(<Nexus2ImportSection open showAction={false} handleRef={handleRef} />);
      await screen.findByRole('switch', { name: FAN_NAME });
      await enterViewport();
      expect(handleRef.current?.fanListSeen()).toBe(true);
      view.rerender(<Nexus2ImportSection open={false} showAction={false} handleRef={handleRef} />);
      view.rerender(<Nexus2ImportSection open showAction={false} handleRef={handleRef} />);
      await screen.findByRole('switch', { name: FAN_NAME });
      expect(handleRef.current?.fanListSeen()).toBe(false);
    });
  });

  it('sends fanCurves in the apply call', async () => {
    vi.mocked(previewNexus2Import).mockResolvedValue({ available: true, profileName: null, categories: [FAN_CATEGORY] });
    renderSection();
    await screen.findByRole('switch', { name: FAN_NAME });
    fireEvent.click(screen.getByRole('button', { name: IMPORT_BUTTON_NAME }));
    await waitFor(() => expect(applyNexus2Import).toHaveBeenCalledWith(['fanCurves'], true));
  });

  it('shows the note on an unchecked, disabled group when nothing is importable', async () => {
    vi.mocked(previewNexus2Import).mockResolvedValue({
      available: true, profileName: null,
      categories: [{ id: 'fanCurves', available: false, count: 0, fanCurvesNote: 'noUserCurves' }],
    });
    renderSection();
    const fan = await screen.findByRole('switch', { name: FAN_NAME });
    expect(fan).not.toBeChecked();
    expect(fan).toBeDisabled();
    expect(screen.getByText(`${FAN}.note.noUserCurves`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: IMPORT_BUTTON_NAME })).toBeDisabled();
  });

  it('reports the applied curve count in the result row', async () => {
    vi.mocked(previewNexus2Import).mockResolvedValue({ available: true, profileName: null, categories: [FAN_CATEGORY] });
    vi.mocked(applyNexus2Import).mockResolvedValue({ results: [{ id: 'fanCurves', status: 'applied', detail: null, count: 3 }] });
    renderSection();
    await screen.findByRole('switch', { name: FAN_NAME });
    fireEvent.click(screen.getByRole('button', { name: IMPORT_BUTTON_NAME }));
    expect(await screen.findByText('nexus2Welcome.import.result.fanCurvesApplied.other:3')).toBeInTheDocument();
  });

  describe('Recommended mode preset', () => {
    const PRESET_CATEGORY = {
      id: 'fanCurves' as const, available: true, count: 0,
      fanCurvesNote: 'recommendedMode' as const, recommendedFrom: 'balanced' as const, recommendedPreset: 'balanced' as const,
    };
    const CURVE_CATEGORY = {
      id: 'fanCurves' as const, available: true, count: 1,
      fanCurves: [{ name: 'Quiet', kind: 'graph' as const, status: 'import' as const, minimumRaised: false, targets: [{ label: 'Front', status: 'import' as const }] }],
    };
    const load = (cat: object) => vi.mocked(previewNexus2Import).mockResolvedValue(
      { available: true, profileName: null, categories: [cat] } as Nexus2PreviewResponse,
    );

    it('available: checked, one preset line, preset header, applies', async () => {
      load(PRESET_CATEGORY);
      renderSection();
      expect(await screen.findByRole('switch', { name: 'cooling.title' })).toBeChecked();
      expect(screen.getByText(`${FAN}.presetDetail:cooling.mode.balanced,cooling.mode.balanced`)).toBeInTheDocument();
      expect(screen.getAllByText('nexus2Welcome.import.title.fanPreset').length).toBeGreaterThan(0);
      fireEvent.click(screen.getByRole('button', { name: IMPORT_BUTTON_NAME }));
      await waitFor(() => expect(applyNexus2Import).toHaveBeenCalledWith(['fanCurves'], true));
    });

    it('customized: disabled and unchecked with the kept-setup note', async () => {
      load({ ...PRESET_CATEGORY, available: false, fanCurvesNote: 'nexus3CoolingCustomized' });
      renderSection();
      const fan = await screen.findByRole('switch', { name: FAN_NAME });
      expect(fan).toBeDisabled();
      expect(fan).not.toBeChecked();
      expect(screen.getByText(`${FAN}.note.nexus3CoolingCustomized:cooling.mode.balanced`)).toBeInTheDocument();
    });

    it('unmappable: keeps the existing note', async () => {
      load({ id: 'fanCurves', available: false, count: 0, fanCurvesNote: 'recommendedMode' });
      renderSection();
      const fan = await screen.findByRole('switch', { name: FAN_NAME });
      expect(fan).toBeDisabled();
      expect(screen.getByText(`${FAN}.note.recommendedMode`)).toBeInTheDocument();
    });

    it('result row names the applied preset', async () => {
      load(PRESET_CATEGORY);
      vi.mocked(applyNexus2Import).mockResolvedValue({ results: [{ id: 'fanCurves', status: 'applied', detail: null, preset: 'balanced' }] });
      renderSection();
      await screen.findByRole('switch', { name: 'cooling.title' });
      fireEvent.click(screen.getByRole('button', { name: IMPORT_BUTTON_NAME }));
      expect(await screen.findByText('nexus2Welcome.import.result.presetApplied:cooling.mode.balanced')).toBeInTheDocument();
    });

    it('a preset-only group still needs to be seen before it applies', async () => {
      load(PRESET_CATEGORY);
      const handleRef = { current: null as Nexus2ImportHandle | null };
      const view = renderSection({ handleRef, showAction: false, visible: false });
      await screen.findByRole('switch', { name: 'cooling.title' });
      expect(handleRef.current?.fanCurvesNeedReview()).toBe(true);
      expect(handleRef.current?.fanCurvesNeedReview(true)).toBe(true);
      view.rerender(<Nexus2ImportSection open showAction={false} handleRef={handleRef} visible />);
      expect(handleRef.current?.fanCurvesNeedReview()).toBe(false);
    });

    it('result row is labeled Cooling when the preset applied', async () => {
      load(PRESET_CATEGORY);
      vi.mocked(applyNexus2Import).mockResolvedValue({ results: [{ id: 'fanCurves', status: 'applied', detail: null, preset: 'balanced' }] });
      renderSection();
      await screen.findByRole('switch', { name: 'cooling.title' });
      fireEvent.click(screen.getByRole('button', { name: IMPORT_BUTTON_NAME }));
      await screen.findByText('nexus2Welcome.import.result.presetApplied:cooling.mode.balanced');
      expect(screen.queryByText(FAN_NAME)).not.toBeInTheDocument();
    });

    it('a post-preview skip shows the reason under a Cooling row, no success summary, and refreshes the group', async () => {
      const customized = { ...PRESET_CATEGORY, available: false, fanCurvesNote: 'nexus3CoolingCustomized' as const };
      vi.mocked(previewNexus2Import)
        .mockResolvedValueOnce({ available: true, profileName: null, categories: [PRESET_CATEGORY] } as Nexus2PreviewResponse)
        .mockResolvedValue({ available: true, profileName: null, categories: [customized] } as Nexus2PreviewResponse);
      vi.mocked(applyNexus2Import).mockResolvedValue({ results: [{ id: 'fanCurves', status: 'skipped', detail: 'nexus3CoolingCustomized' }] });
      renderSection();
      await screen.findByRole('switch', { name: 'cooling.title' });
      fireEvent.click(screen.getByRole('button', { name: IMPORT_BUTTON_NAME }));
      expect(await screen.findByText(/nexus2Welcome.import.result.detail.nexus3CoolingCustomized/)).toBeInTheDocument();
      expect(screen.queryByText('nexus2Welcome.import.successSummary')).not.toBeInTheDocument();
      // The result row keeps the Cooling label even after the preview refresh flips the toggle to curves wording.
      await waitFor(() => expect(screen.getByRole('switch', { name: FAN_NAME })).toBeDisabled());
      expect(screen.getByRole('switch', { name: FAN_NAME })).not.toBeChecked();
      expect(previewNexus2Import).toHaveBeenCalledTimes(2);
      const row = screen.getByText('nexus2Welcome.import.result.status.skipped').closest('li')!;
      expect(within(row).getByText('cooling.title', { selector: `.${styles.resultCategory}` })).toBeInTheDocument();
    });

    it('the post-skip refetch keeps the other toggles and drops a late response after unmount', async () => {
      const customized = { ...PRESET_CATEGORY, available: false, fanCurvesNote: 'nexus3CoolingCustomized' as const };
      let resolveFresh: (v: Nexus2PreviewResponse) => void = () => {};
      vi.mocked(previewNexus2Import)
        .mockResolvedValueOnce({ available: true, profileName: null, categories: [Q60_FACE, PRESET_CATEGORY] } as Nexus2PreviewResponse)
        .mockImplementationOnce(() => new Promise<Nexus2PreviewResponse>(r => { resolveFresh = r; }));
      vi.mocked(applyNexus2Import).mockResolvedValue({ results: [{ id: 'fanCurves', status: 'skipped', detail: 'nexus3CoolingCustomized' }] });
      renderSection();
      await screen.findByRole('switch', { name: 'cooling.title' });
      fireEvent.click(screen.getByRole('switch', { name: Q60_GROUP_NAME }));
      fireEvent.click(screen.getByRole('button', { name: IMPORT_BUTTON_NAME }));
      await waitFor(() => expect(previewNexus2Import).toHaveBeenCalledTimes(2));
      // The user re-ticks Q-Series while the refetch is in flight; the late response must not undo it.
      fireEvent.click(screen.getByRole('switch', { name: Q60_GROUP_NAME }));
      await act(async () => { resolveFresh({ available: true, profileName: null, categories: [Q60_FACE, customized] } as Nexus2PreviewResponse); });
      expect(screen.getByRole('switch', { name: Q60_GROUP_NAME })).toBeChecked();
      expect(screen.getByRole('switch', { name: FAN_NAME })).not.toBeChecked();
    });

    it('a stale refetch after a reopen is ignored', async () => {
      const customized = { ...PRESET_CATEGORY, available: false, fanCurvesNote: 'nexus3CoolingCustomized' as const };
      let resolveFresh: (v: Nexus2PreviewResponse) => void = () => {};
      vi.mocked(previewNexus2Import)
        .mockResolvedValueOnce({ available: true, profileName: null, categories: [PRESET_CATEGORY] } as Nexus2PreviewResponse)
        .mockImplementationOnce(() => new Promise<Nexus2PreviewResponse>(r => { resolveFresh = r; }))
        .mockResolvedValue({ available: true, profileName: null, categories: [PRESET_CATEGORY] } as Nexus2PreviewResponse);
      vi.mocked(applyNexus2Import).mockResolvedValue({ results: [{ id: 'fanCurves', status: 'skipped', detail: 'coolingDisabled' }] });
      const view = render(<Nexus2ImportSection open />);
      await screen.findByRole('switch', { name: 'cooling.title' });
      fireEvent.click(screen.getByRole('button', { name: IMPORT_BUTTON_NAME }));
      await waitFor(() => expect(previewNexus2Import).toHaveBeenCalledTimes(2));
      view.rerender(<Nexus2ImportSection open={false} />);
      view.rerender(<Nexus2ImportSection open />);
      await screen.findByRole('switch', { name: 'cooling.title' });
      await act(async () => { resolveFresh({ available: true, profileName: null, categories: [customized] } as Nexus2PreviewResponse); });
      expect(screen.getByRole('switch', { name: 'cooling.title' })).toBeChecked();
    });

    it('a coolingDisabled skip on the curve path labels the line like its row', async () => {
      vi.mocked(previewNexus2Import).mockResolvedValue({ available: true, profileName: null, categories: [CURVE_CATEGORY] } as Nexus2PreviewResponse);
      vi.mocked(applyNexus2Import).mockResolvedValue({ results: [{ id: 'fanCurves', status: 'skipped', detail: 'coolingDisabled' }] });
      renderSection();
      await screen.findByRole('switch', { name: FAN_NAME });
      fireEvent.click(screen.getByRole('button', { name: IMPORT_BUTTON_NAME }));
      const row = (await screen.findByText('nexus2Welcome.import.result.status.skipped')).closest('li')!;
      expect(within(row).getByText(FAN_NAME)).toBeInTheDocument();
      expect(within(row).getByText(/^nexus2Welcome.import.result.subDetail:nexus2Welcome.import.group.fanCurves.label/)).toBeInTheDocument();
    });

    it('a coolingDisabled skip is informational: clean outcome, reason shown, no success', async () => {
      load(PRESET_CATEGORY);
      vi.mocked(applyNexus2Import).mockResolvedValue({ results: [{ id: 'fanCurves', status: 'skipped', detail: 'coolingDisabled' }] });
      const handleRef = { current: null as Nexus2ImportHandle | null };
      renderSection({ handleRef, showAction: false });
      await screen.findByRole('switch', { name: 'cooling.title' });
      let outcome: string | undefined;
      await act(async () => { outcome = await handleRef.current?.runImport(); });
      expect(outcome).toBe('clean');
      expect(await screen.findByText(/nexus2Welcome.import.result.detail.coolingDisabled/)).toBeInTheDocument();
      expect(screen.queryByText('nexus2Welcome.import.successSummary')).not.toBeInTheDocument();
    });

    it('an unknown preset is unmappable: note shown, group disabled, never curves', async () => {
      load({ ...PRESET_CATEGORY, recommendedPreset: 'future' });
      renderSection();
      const fan = await screen.findByRole('switch', { name: FAN_NAME });
      expect(fan).toBeDisabled();
      expect(fan).not.toBeChecked();
      expect(screen.getByText(`${FAN}.note.recommendedMode`)).toBeInTheDocument();
      expect(screen.queryByText(/fanCurves.detail/)).not.toBeInTheDocument();
    });
  });
});
