// Pure helpers for the AI assistant runtime/model progress display. Kept
// side-effect-free so they're covered directly by assistantProgress.test.ts
// instead of through component rendering.
import type { AssistantPullProgress, AssistantRuntimeState } from '../../../api/aiIntegration';

/**
 * Whether the assistant is mid-operation: a runtime download/start in
 * progress, or a model pull that hasn't reached "success" yet. Drives when
 * the section refetches GET /ai/assistant/status after a live WS frame
 * settles, mirroring the "refetch the canonical resource once the push
 * signals terminal" idiom used for benchmark runs.
 */
export function isAssistantTransient(
  runtimeState: AssistantRuntimeState,
  pull: AssistantPullProgress | null,
): boolean {
  if (runtimeState === 'downloading' || runtimeState === 'starting') return true;
  if (pull && pull.status !== 'success') return true;
  return false;
}

/** Percent complete in [0, 100], rounded. Zero when total is unknown. */
export function progressPercent(received: number, total: number): number {
  if (!(total > 0)) return 0;
  return Math.max(0, Math.min(100, Math.round((received / total) * 100)));
}
