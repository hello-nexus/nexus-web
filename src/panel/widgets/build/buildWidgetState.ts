export type BuildWidgetView = 'loading' | 'mac' | 'preview' | 'no-case' | 'no-preview';

export interface BuildWidgetInputs {
  /** null until the host platform is known. */
  isMac: boolean | null;
  /** True once the first case + preview fetch settled. */
  loaded: boolean;
  caseId: string | null;
  previewUrl: string | null;
}

export function selectBuildWidgetView({ isMac, loaded, caseId, previewUrl }: BuildWidgetInputs): BuildWidgetView {
  if (isMac) return 'mac';
  if (isMac === null || !loaded) return 'loading';
  if (previewUrl) return 'preview';
  return caseId ? 'no-preview' : 'no-case';
}
