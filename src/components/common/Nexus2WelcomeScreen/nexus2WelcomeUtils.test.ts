import { describe, expect, it } from 'vitest';
import type { Nexus2ApplyResult, Nexus2PreviewCategory, Nexus2PreviewResponse, Nexus2StatusResponse } from '../../../api/migration';
import {
  IMPORT_GROUPS,
  allApplyResultsClean,
  applyDetailKey,
  applyStatusKey,
  availableCategories,
  categoryDetail,
  categoryLabelKey,
  defaultSelectedGroupIds,
  groupDetailParts,
  groupResultSummaries,
  initialActionChecks,
  selectedWireIds,
  visibleImportGroups,
} from './nexus2WelcomeUtils';

const BASE_STATUS: Nexus2StatusResponse = {
  detected: true,
  importAvailable: true,
  deviceEligible: true,
  version: '2.16.0',
  autostartTaskPresent: false,
  running: false,
  pending: true,
};

describe('initialActionChecks', () => {
  it('pre-checks closeApp only when running', () => {
    expect(initialActionChecks({ ...BASE_STATUS, running: true })).toEqual({ closeApp: true, disableAutostart: false });
  });

  it('pre-checks disableAutostart only when autostartTaskPresent', () => {
    expect(initialActionChecks({ ...BASE_STATUS, autostartTaskPresent: true })).toEqual({ closeApp: false, disableAutostart: true });
  });

  it('checks neither for a null payload', () => {
    expect(initialActionChecks(null)).toEqual({ closeApp: false, disableAutostart: false });
  });
});

describe('categoryLabelKey', () => {
  it('resolves a known category id', () => {
    expect(categoryLabelKey('wallpapers')).toBe('nexus2Welcome.import.category.wallpapers.label');
  });

  it('falls back to the generic label for an unknown id', () => {
    expect(categoryLabelKey('futureCategory')).toBe('nexus2Welcome.import.category.other.label');
  });

  it('falls back to the generic label for language, which the web never groups', () => {
    expect(categoryLabelKey('language')).toBe('nexus2Welcome.import.category.other.label');
  });
});

describe('categoryDetail', () => {
  it('formats y70Layout as pages + mappedWidgets, not the raw widget count', () => {
    expect(categoryDetail({ id: 'y70Layout', available: true, pages: 3, widgets: 12, mappedWidgets: 10, droppedTypes: ['aquarium'] }))
      .toEqual({ key: 'nexus2Welcome.import.category.y70Layout.detail', params: { pages: 3, widgets: 10 } });
  });

  it('formats wallpapers as a count', () => {
    expect(categoryDetail({ id: 'wallpapers', available: true, count: 4 }))
      .toEqual({ key: 'nexus2Welcome.import.category.wallpapers.detail', params: { count: 4 } });
  });

  it('formats gallerySources as a count only, regardless of missing', () => {
    expect(categoryDetail({ id: 'gallerySources', available: true, count: 5, missing: 2 }))
      .toEqual({ key: 'nexus2Welcome.import.category.gallerySources.detail', params: { count: 5 } });
  });

  it('falls back to the generic detail key for language, which the web never groups', () => {
    expect(categoryDetail({ id: 'language', available: true, value: 'it' }))
      .toEqual({ key: 'nexus2Welcome.import.category.other.detail', params: { id: 'language' } });
  });

  it('falls back to the generic detail key for a category id this build does not model', () => {
    const futureCategory = { id: 'futureCategory', available: true } as unknown as Nexus2PreviewCategory;
    expect(categoryDetail(futureCategory))
      .toEqual({ key: 'nexus2Welcome.import.category.other.detail', params: { id: 'futureCategory' } });
  });
});

describe('applyStatusKey', () => {
  it('resolves a known status', () => {
    expect(applyStatusKey('applied')).toBe('nexus2Welcome.import.result.status.applied');
    expect(applyStatusKey('needsConfirm')).toBe('nexus2Welcome.import.result.status.needsConfirm');
  });

  it('falls back to the generic unknown-status key for a status this build does not model', () => {
    expect(applyStatusKey('futureStatus')).toBe('nexus2Welcome.import.result.status.unknown');
  });
});

describe('applyDetailKey', () => {
  it('resolves the documented no-q60-record hint', () => {
    expect(applyDetailKey('no-q60-record')).toBe('nexus2Welcome.import.result.detail.noQ60Record');
  });

  it('falls back to the generic detail key for an unknown hint', () => {
    expect(applyDetailKey('some-future-hint')).toBe('nexus2Welcome.import.result.detail.generic');
  });
});

const PREVIEW: Nexus2PreviewResponse = {
  available: true,
  profileName: 'Default',
  categories: [
    { id: 'appearance', available: true, accentColor: '#ff0000', background: null },
    { id: 'y70Layout', available: false, pages: 0, widgets: 0, mappedWidgets: 0, droppedTypes: [] },
    { id: 'wallpapers', available: true, count: 2 },
    { id: 'language', available: true, value: 'it' },
  ],
};

describe('availableCategories', () => {
  it('keeps only categories marked available', () => {
    expect(availableCategories(PREVIEW).map(c => c.id)).toEqual(['appearance', 'wallpapers', 'language']);
  });

  it('is empty for a null preview', () => {
    expect(availableCategories(null)).toEqual([]);
  });
});

describe('IMPORT_GROUPS', () => {
  it('groups exactly the seven wire categories into two groups, excluding language', () => {
    const allWireIds = IMPORT_GROUPS.flatMap(g => g.wireIds);
    expect(allWireIds.sort()).toEqual(['appearance', 'gallerySources', 'q60Face', 'rotation', 'wallpapers', 'y70Layout'].sort());
  });

  it('y70Panel carries y70Layout, appearance, and gallerySources', () => {
    const y70 = IMPORT_GROUPS.find(g => g.id === 'y70Panel');
    expect(y70?.wireIds.slice().sort()).toEqual(['appearance', 'gallerySources', 'y70Layout'].sort());
  });

  it('q60Panel carries q60Face, wallpapers, and rotation', () => {
    const q60 = IMPORT_GROUPS.find(g => g.id === 'q60Panel');
    expect(q60?.wireIds.slice().sort()).toEqual(['q60Face', 'rotation', 'wallpapers'].sort());
  });
});

describe('visibleImportGroups / defaultSelectedGroupIds', () => {
  it('shows a group when at least one of its wire categories is available', () => {
    // appearance is available -> y70Panel shows even though y70Layout/gallerySources are absent.
    expect(visibleImportGroups(PREVIEW).map(g => g.id)).toEqual(['y70Panel', 'q60Panel']);
  });

  it('hides a group when none of its wire categories are available', () => {
    const preview: Nexus2PreviewResponse = {
      available: true,
      profileName: null,
      categories: [{ id: 'appearance', available: false, accentColor: null, background: null }],
    };
    expect(visibleImportGroups(preview)).toEqual([]);
  });

  it('pre-selects every visible group', () => {
    expect(defaultSelectedGroupIds(PREVIEW)).toEqual(new Set(['y70Panel', 'q60Panel']));
  });

  it('is empty for a null preview', () => {
    expect(visibleImportGroups(null)).toEqual([]);
    expect(defaultSelectedGroupIds(null)).toEqual(new Set());
  });
});

describe('groupDetailParts', () => {
  it('builds one positive detail part per available member category', () => {
    const y70 = IMPORT_GROUPS.find(g => g.id === 'y70Panel')!;
    expect(groupDetailParts(PREVIEW, y70)).toEqual([
      { key: 'nexus2Welcome.import.category.appearance.detail', params: { accent: '#ff0000' } },
    ]);
  });

  it('is empty for a group with no available members', () => {
    const q60 = IMPORT_GROUPS.find(g => g.id === 'q60Panel')!;
    const preview: Nexus2PreviewResponse = {
      available: true,
      profileName: null,
      categories: [{ id: 'q60Face', available: false, face: null, stashedFaces: 0 }],
    };
    expect(groupDetailParts(preview, q60)).toEqual([]);
  });
});

describe('selectedWireIds', () => {
  it('expands a checked group to only its available wire ids', () => {
    expect(selectedWireIds(PREVIEW, new Set(['y70Panel']))).toEqual(['appearance']);
  });

  it('never includes an unchecked group', () => {
    expect(selectedWireIds(PREVIEW, new Set(['q60Panel']))).toEqual(['wallpapers']);
  });

  it('is empty when no group is checked', () => {
    expect(selectedWireIds(PREVIEW, new Set())).toEqual([]);
  });

  it('is empty for a null preview', () => {
    expect(selectedWireIds(null, new Set(['y70Panel', 'q60Panel']))).toEqual([]);
  });
});

describe('groupResultSummaries', () => {
  it('is empty for null results', () => {
    expect(groupResultSummaries(null)).toEqual([]);
  });

  it('rolls a clean group up to applied', () => {
    const results: Nexus2ApplyResult[] = [
      { id: 'appearance', status: 'applied', detail: null },
      { id: 'gallerySources', status: 'skipped', detail: null },
    ];
    expect(groupResultSummaries(results)).toEqual([
      { groupId: 'y70Panel', labelKey: 'nexus2Welcome.import.group.y70Panel.label', status: 'applied', issues: [] },
    ]);
  });

  it('worst status wins: failed beats needsConfirm beats applied beats skipped', () => {
    const results: Nexus2ApplyResult[] = [
      { id: 'q60Face', status: 'applied', detail: null },
      { id: 'wallpapers', status: 'failed', detail: 'patch-failed' },
      { id: 'rotation', status: 'needsConfirm', detail: 'layout-customized' },
    ];
    const [summary] = groupResultSummaries(results);
    expect(summary.groupId).toBe('q60Panel');
    expect(summary.status).toBe('failed');
  });

  it('collects only failed/needsConfirm members as issues', () => {
    const results: Nexus2ApplyResult[] = [
      { id: 'q60Face', status: 'applied', detail: null },
      { id: 'wallpapers', status: 'failed', detail: 'patch-failed' },
      { id: 'rotation', status: 'needsConfirm', detail: 'layout-customized' },
    ];
    const [summary] = groupResultSummaries(results);
    expect(summary.issues.map(i => i.id).sort()).toEqual(['rotation', 'wallpapers']);
  });

  it('omits a group with no results sent for it', () => {
    const results: Nexus2ApplyResult[] = [{ id: 'appearance', status: 'applied', detail: null }];
    expect(groupResultSummaries(results).map(s => s.groupId)).toEqual(['y70Panel']);
  });
});

describe('allApplyResultsClean', () => {
  it('is false when any result needs confirmation or failed', () => {
    expect(allApplyResultsClean([
      { id: 'appearance', status: 'applied', detail: null },
      { id: 'y70Layout', status: 'needsConfirm', detail: null },
    ])).toBe(false);
    expect(allApplyResultsClean([{ id: 'appearance', status: 'applied', detail: null }])).toBe(true);
    expect(allApplyResultsClean([{ id: 'appearance', status: 'skipped', detail: null }])).toBe(true);
    expect(allApplyResultsClean([])).toBe(false);
    expect(allApplyResultsClean(null)).toBe(false);
  });
});
