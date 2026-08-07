import { describe, expect, it } from 'vitest';
import type { Nexus2ApplyResult, Nexus2PreviewCategory, Nexus2PreviewResponse, Nexus2StatusResponse } from '../../../api/migration';
import {
  allApplyResultsClean,
  applyDetailKey,
  applyStatusKey,
  availableCategories,
  categoryDetail,
  categoryLabelKey,
  defaultSelectedCategoryIds,
  droppedTypeKey,
  droppedY70Types,
  initialActionChecks,
  resultFor,
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
});

describe('categoryDetail', () => {
  it('formats y70Layout as pages + widgets', () => {
    expect(categoryDetail({ id: 'y70Layout', available: true, pages: 3, widgets: 12, mappedWidgets: 10, droppedTypes: [] }))
      .toEqual({ key: 'nexus2Welcome.import.category.y70Layout.detail', params: { pages: 3, widgets: 12 } });
  });

  it('formats wallpapers as a count', () => {
    expect(categoryDetail({ id: 'wallpapers', available: true, count: 4 }))
      .toEqual({ key: 'nexus2Welcome.import.category.wallpapers.detail', params: { count: 4 } });
  });

  it('formats language as its raw value, falling back to a dash', () => {
    expect(categoryDetail({ id: 'language', available: true, value: 'it' }))
      .toEqual({ key: 'nexus2Welcome.import.category.language.detail', params: { value: 'it' } });
    expect(categoryDetail({ id: 'language', available: true, value: null }))
      .toEqual({ key: 'nexus2Welcome.import.category.language.detail', params: { value: '-' } });
  });

  it('switches the gallerySources key when files are missing', () => {
    expect(categoryDetail({ id: 'gallerySources', available: true, count: 5, missing: 0 }))
      .toEqual({ key: 'nexus2Welcome.import.category.gallerySources.detail', params: { count: 5 } });
    expect(categoryDetail({ id: 'gallerySources', available: true, count: 5, missing: 2 }))
      .toEqual({ key: 'nexus2Welcome.import.category.gallerySources.detailWithMissing', params: { count: 5, missing: 2 } });
  });

  it('falls back to the generic detail key for a category id this build does not model', () => {
    const futureCategory = { id: 'futureCategory', available: true } as unknown as Nexus2PreviewCategory;
    expect(categoryDetail(futureCategory))
      .toEqual({ key: 'nexus2Welcome.import.category.other.detail', params: { id: 'futureCategory' } });
  });
});

describe('droppedTypeKey', () => {
  it('resolves a known Nexus 2 widget type', () => {
    expect(droppedTypeKey('aquarium')).toBe('nexus2Welcome.import.droppedType.aquarium');
  });

  it('falls back to the generic key for an unknown type', () => {
    expect(droppedTypeKey('futureWidget')).toBe('nexus2Welcome.import.droppedType.other');
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
  ],
};

describe('availableCategories / defaultSelectedCategoryIds', () => {
  it('keeps only categories marked available', () => {
    expect(availableCategories(PREVIEW).map(c => c.id)).toEqual(['appearance', 'wallpapers']);
  });

  it('pre-selects every available category', () => {
    expect(defaultSelectedCategoryIds(PREVIEW)).toEqual(new Set(['appearance', 'wallpapers']));
  });

  it('is empty for a null preview', () => {
    expect(availableCategories(null)).toEqual([]);
    expect(defaultSelectedCategoryIds(null)).toEqual(new Set());
  });
});

describe('droppedY70Types', () => {
  it('reads the dropped types off an available y70Layout category', () => {
    const preview: Nexus2PreviewResponse = {
      available: true,
      profileName: null,
      categories: [
        { id: 'y70Layout', available: true, pages: 1, widgets: 2, mappedWidgets: 1, droppedTypes: ['aquarium', 'avatar'] },
      ],
    };
    expect(droppedY70Types(preview)).toEqual(['aquarium', 'avatar']);
  });

  it('is empty when y70Layout is absent, unavailable, or the preview is null', () => {
    expect(droppedY70Types(null)).toEqual([]);
    expect(droppedY70Types(PREVIEW)).toEqual([]);
    expect(droppedY70Types({
      available: true,
      profileName: null,
      categories: [{ id: 'y70Layout', available: false, pages: 0, widgets: 0, mappedWidgets: 0, droppedTypes: ['macros'] }],
    })).toEqual([]);
  });
});

const RESULTS: Nexus2ApplyResult[] = [
  { id: 'appearance', status: 'applied', detail: null },
  { id: 'y70Layout', status: 'needsConfirm', detail: null },
];

describe('resultFor / allApplyResultsClean', () => {
  it('finds a result by category id', () => {
    expect(resultFor(RESULTS, 'y70Layout')).toEqual({ id: 'y70Layout', status: 'needsConfirm', detail: null });
    expect(resultFor(RESULTS, 'rotation')).toBeUndefined();
  });

  it('is false when any result needs confirmation or failed', () => {
    expect(allApplyResultsClean(RESULTS)).toBe(false);
    expect(allApplyResultsClean([{ id: 'appearance', status: 'applied', detail: null }])).toBe(true);
    expect(allApplyResultsClean([{ id: 'appearance', status: 'skipped', detail: null }])).toBe(true);
    expect(allApplyResultsClean([])).toBe(false);
    expect(allApplyResultsClean(null)).toBe(false);
  });
});
