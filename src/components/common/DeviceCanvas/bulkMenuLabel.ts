import { pluralKey } from '../../../lib/pluralKey';
import type { Language } from '../../../lib/settings';

/**
 * Label for a device-card menu row that acts either on one card or on the
 * whole selection it belongs to. Shared by the lighting and cooling cards so
 * both read "Turn off Nexus Control" alone and "… (3 fans)" in a selection
 * from one rule.
 */
export function bulkMenuLabel(
  t: (key: string, params?: Record<string, string | number>) => string,
  language: Language,
  bulk: { count: number } | undefined,
  single: string,
  counted: string,
): string {
  return bulk ? t(pluralKey(counted, language, bulk.count), { count: bulk.count }) : t(single);
}
