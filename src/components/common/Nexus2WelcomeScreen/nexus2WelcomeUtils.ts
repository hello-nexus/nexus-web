// Pure helpers for Nexus2WelcomeScreen and Nexus2ImportSection, split out for
// direct testing (see elgatoImportUtils.ts for the pattern this follows).
import type {
  Nexus2ApplyResult, Nexus2ApplyStatus, Nexus2CategoryId, Nexus2PreviewCategory,
  Nexus2PreviewResponse, Nexus2StatusResponse,
} from '../../../api/migration';

export interface ActionChecks {
  closeApp: boolean;
  disableAutostart: boolean;
}

/** Pre-check state for the action checkboxes: checked exactly when the row would render. */
export function initialActionChecks(payload: Nexus2StatusResponse | null): ActionChecks {
  return {
    closeApp: !!payload?.running,
    disableAutostart: !!payload?.autostartTaskPresent,
  };
}

const CATEGORY_LABEL_KEYS: Partial<Record<Nexus2CategoryId, string>> = {
  appearance: 'nexus2Welcome.import.category.appearance.label',
  y70Layout: 'nexus2Welcome.import.category.y70Layout.label',
  q60Face: 'nexus2Welcome.import.category.q60Face.label',
  wallpapers: 'nexus2Welcome.import.category.wallpapers.label',
  gallerySources: 'nexus2Welcome.import.category.gallerySources.label',
  rotation: 'nexus2Welcome.import.category.rotation.label',
};

/** Falls back to a generic label (raw id) for a category id this build doesn't recognize. */
export function categoryLabelKey(id: string): string {
  return CATEGORY_LABEL_KEYS[id as Nexus2CategoryId] ?? 'nexus2Welcome.import.category.other.label';
}

export interface CategoryDetail {
  key: string;
  params: Record<string, string | number>;
}

/** The positive-framing count/value line for one available category. */
export function categoryDetail(cat: Nexus2PreviewCategory): CategoryDetail {
  switch (cat.id) {
    case 'appearance':
      return { key: 'nexus2Welcome.import.category.appearance.detail', params: { accent: cat.accentColor ?? '-' } };
    case 'y70Layout':
      return { key: 'nexus2Welcome.import.category.y70Layout.detail', params: { pages: cat.pages, widgets: cat.mappedWidgets } };
    case 'q60Face':
      return { key: 'nexus2Welcome.import.category.q60Face.detail', params: { face: cat.face ?? '-', stashed: cat.stashedFaces } };
    case 'wallpapers':
      return { key: 'nexus2Welcome.import.category.wallpapers.detail', params: { count: cat.count } };
    case 'gallerySources':
      return { key: 'nexus2Welcome.import.category.gallerySources.detail', params: { count: cat.count } };
    case 'rotation':
      return { key: 'nexus2Welcome.import.category.rotation.detail', params: { value: cat.value ?? '-' } };
    default:
      // Only reachable for Nexus2LanguageCategory: the web never groups or
      // sends it, so this just degrades a service-known id to its raw value.
      return { key: 'nexus2Welcome.import.category.other.detail', params: { id: cat.id } };
  }
}

const APPLY_STATUS_KEYS: Record<Nexus2ApplyStatus, string> = {
  applied: 'nexus2Welcome.import.result.status.applied',
  skipped: 'nexus2Welcome.import.result.status.skipped',
  failed: 'nexus2Welcome.import.result.status.failed',
  needsConfirm: 'nexus2Welcome.import.result.status.needsConfirm',
};

/** Falls back to a generic status label for a status this build's closed union doesn't model. */
export function applyStatusKey(status: string): string {
  return (APPLY_STATUS_KEYS as Record<string, string>)[status] ?? 'nexus2Welcome.import.result.status.unknown';
}

const APPLY_DETAIL_KEYS: Record<string, string> = {
  'no-q60-record': 'nexus2Welcome.import.result.detail.noQ60Record',
};

/** Localizes a known apply-result machine hint; unknown hints fall back to a generic line. */
export function applyDetailKey(detail: string): string {
  return APPLY_DETAIL_KEYS[detail] ?? 'nexus2Welcome.import.result.detail.generic';
}

export function availableCategories(preview: Nexus2PreviewResponse | null): Nexus2PreviewCategory[] {
  return preview?.categories.filter(c => c.available) ?? [];
}

// The three wire categories the welcome screen used to list one by one are
// consolidated into two user-facing groups; a group's own checkbox toggles
// every wire id it carries. `language` is deliberately not a member of any
// group - the web never shows or sends it.
export type ImportGroupId = 'y70Panel' | 'q60Panel';

export interface ImportGroupDef {
  id: ImportGroupId;
  wireIds: Nexus2CategoryId[];
  labelKey: string;
}

export const IMPORT_GROUPS: ImportGroupDef[] = [
  {
    id: 'y70Panel',
    wireIds: ['y70Layout', 'appearance', 'gallerySources'],
    labelKey: 'nexus2Welcome.import.group.y70Panel.label',
  },
  {
    id: 'q60Panel',
    wireIds: ['q60Face', 'wallpapers', 'rotation'],
    labelKey: 'nexus2Welcome.import.group.q60Panel.label',
  },
];

/** Groups with at least one available wire category, in display order. */
export function visibleImportGroups(preview: Nexus2PreviewResponse | null): ImportGroupDef[] {
  const available = new Set(availableCategories(preview).map(c => c.id));
  return IMPORT_GROUPS.filter(g => g.wireIds.some(id => available.has(id)));
}

/** The positive detail line for a group, one part per available member category. */
export function groupDetailParts(preview: Nexus2PreviewResponse | null, group: ImportGroupDef): CategoryDetail[] {
  return availableCategories(preview)
    .filter(c => group.wireIds.includes(c.id))
    .map(categoryDetail);
}

/** Every visible group starts checked. */
export function defaultSelectedGroupIds(preview: Nexus2PreviewResponse | null): Set<ImportGroupId> {
  return new Set(visibleImportGroups(preview).map(g => g.id));
}

/** The available wire ids of every checked group - what an apply call actually sends. */
export function selectedWireIds(preview: Nexus2PreviewResponse | null, selectedGroups: Set<ImportGroupId>): Nexus2CategoryId[] {
  const available = new Set(availableCategories(preview).map(c => c.id));
  return IMPORT_GROUPS
    .filter(g => selectedGroups.has(g.id))
    .flatMap(g => g.wireIds.filter(id => available.has(id)));
}

const STATUS_SEVERITY: Record<Nexus2ApplyStatus, number> = {
  skipped: 0,
  applied: 1,
  needsConfirm: 2,
  failed: 3,
};

export interface GroupResultSummary {
  groupId: ImportGroupId;
  labelKey: string;
  status: Nexus2ApplyStatus;
  /** The failed/needsConfirm members, for the detail line(s) under the group row. */
  issues: Nexus2ApplyResult[];
}

/**
 * Rolls apply results up per group: the group's status is its worst member
 * (failed beats needsConfirm beats applied beats skipped), so a single stuck
 * category never reads as an overall success.
 */
export function groupResultSummaries(results: Nexus2ApplyResult[] | null): GroupResultSummary[] {
  if (!results) return [];
  const summaries: GroupResultSummary[] = [];
  for (const group of IMPORT_GROUPS) {
    const members = results.filter(r => group.wireIds.some(id => id === r.id));
    if (members.length === 0) continue;
    const status = members.reduce<Nexus2ApplyStatus>(
      (worst, r) => (STATUS_SEVERITY[r.status] > STATUS_SEVERITY[worst] ? r.status : worst),
      members[0].status,
    );
    const issues = members.filter(r => r.status === 'failed' || r.status === 'needsConfirm');
    summaries.push({ groupId: group.id, labelKey: group.labelKey, status, issues });
  }
  return summaries;
}

/** True once every result applied cleanly (skipped counts as clean; failed/needsConfirm do not). */
export function allApplyResultsClean(results: Nexus2ApplyResult[] | null): boolean {
  return !!results && results.length > 0 && results.every(r => r.status === 'applied' || r.status === 'skipped');
}
