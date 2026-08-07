// Pure helpers for Nexus2WelcomeScreen, split out for direct testing (see
// elgatoImportUtils.ts for the pattern this follows).
import type {
  Nexus2ApplyResult, Nexus2ApplyStatus, Nexus2CategoryId, Nexus2PreviewCategory,
  Nexus2PreviewResponse, Nexus2StatusResponse, Nexus2Y70LayoutCategory,
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

export const CATEGORY_LABEL_KEYS: Record<Nexus2CategoryId, string> = {
  appearance: 'nexus2Welcome.import.category.appearance.label',
  y70Layout: 'nexus2Welcome.import.category.y70Layout.label',
  q60Face: 'nexus2Welcome.import.category.q60Face.label',
  wallpapers: 'nexus2Welcome.import.category.wallpapers.label',
  gallerySources: 'nexus2Welcome.import.category.gallerySources.label',
  rotation: 'nexus2Welcome.import.category.rotation.label',
  language: 'nexus2Welcome.import.category.language.label',
};

/** Falls back to a generic label (raw id) for a category id this build doesn't recognize. */
export function categoryLabelKey(id: string): string {
  return (CATEGORY_LABEL_KEYS as Record<string, string>)[id] ?? 'nexus2Welcome.import.category.other.label';
}

export interface CategoryDetail {
  key: string;
  params: Record<string, string | number>;
}

/** The count/value line under each category checkbox. */
export function categoryDetail(cat: Nexus2PreviewCategory): CategoryDetail {
  switch (cat.id) {
    case 'appearance':
      return { key: 'nexus2Welcome.import.category.appearance.detail', params: { accent: cat.accentColor ?? '-' } };
    case 'y70Layout':
      return { key: 'nexus2Welcome.import.category.y70Layout.detail', params: { pages: cat.pages, widgets: cat.widgets } };
    case 'q60Face':
      return { key: 'nexus2Welcome.import.category.q60Face.detail', params: { face: cat.face ?? '-', stashed: cat.stashedFaces } };
    case 'wallpapers':
      return { key: 'nexus2Welcome.import.category.wallpapers.detail', params: { count: cat.count } };
    case 'gallerySources':
      return cat.missing > 0
        ? { key: 'nexus2Welcome.import.category.gallerySources.detailWithMissing', params: { count: cat.count, missing: cat.missing } }
        : { key: 'nexus2Welcome.import.category.gallerySources.detail', params: { count: cat.count } };
    case 'rotation':
      return { key: 'nexus2Welcome.import.category.rotation.detail', params: { value: cat.value ?? '-' } };
    case 'language':
      return { key: 'nexus2Welcome.import.category.language.detail', params: { value: cat.value ?? '-' } };
    default:
      // Guards a category id this build's closed union doesn't model, so a
      // service ahead of the web release degrades to a raw id instead of
      // throwing on an unguarded property read.
      return { key: 'nexus2Welcome.import.category.other.detail', params: { id: (cat as Nexus2PreviewCategory).id } };
  }
}

const DROPPED_TYPE_KEYS: Record<string, string> = {
  aquarium: 'nexus2Welcome.import.droppedType.aquarium',
  avatar: 'nexus2Welcome.import.droppedType.avatar',
  whiteboard: 'nexus2Welcome.import.droppedType.whiteboard',
  iframe: 'nexus2Welcome.import.droppedType.iframe',
  macros: 'nexus2Welcome.import.droppedType.macros',
  q60: 'nexus2Welcome.import.droppedType.q60',
};

/** i18n key for one Nexus 2 widget type dropped from the y70Layout import. */
export function droppedTypeKey(type: string): string {
  return DROPPED_TYPE_KEYS[type] ?? 'nexus2Welcome.import.droppedType.other';
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

/** The Nexus 2 widget types dropped from an available y70Layout category, or []. */
export function droppedY70Types(preview: Nexus2PreviewResponse | null): string[] {
  const y70 = availableCategories(preview).find((c): c is Nexus2Y70LayoutCategory => c.id === 'y70Layout');
  return y70?.droppedTypes ?? [];
}

/** Every available category starts pre-checked. */
export function defaultSelectedCategoryIds(preview: Nexus2PreviewResponse | null): Set<string> {
  return new Set(availableCategories(preview).map(c => c.id));
}

export function resultFor(results: Nexus2ApplyResult[] | null, id: string): Nexus2ApplyResult | undefined {
  return results?.find(r => r.id === id);
}

/** True once every result applied cleanly (skipped counts as clean; failed/needsConfirm do not). */
export function allApplyResultsClean(results: Nexus2ApplyResult[] | null): boolean {
  return !!results && results.length > 0 && results.every(r => r.status === 'applied' || r.status === 'skipped');
}
