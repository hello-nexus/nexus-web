import type { AppMetadata } from '../widgets/types';
import type { PanelSurface } from '../types';

/** The notice key an app wants above its settings on any surface but the desktop dashboard, or null when none applies. */
export function desktopOnlyEditorHintFor(meta: Pick<AppMetadata, 'desktopOnlyHintKey'> | undefined, surface: PanelSurface): string | null {
  if (!meta?.desktopOnlyHintKey) return null;
  return surface === 'desktop' ? null : meta.desktopOnlyHintKey;
}
