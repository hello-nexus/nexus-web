// Dates are local (not UTC) yyyy-MM-dd strings, matching the wire contract.

export type ClearDataPreset = 'today' | 'last7Days' | 'last30Days' | 'custom' | 'allTime';

export interface ClearDataRange {
  from: string;
  to: string;
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * Resolves a preset to a concrete [from, to] range. Returns null for
 * 'allTime' (the caller invokes the scope's all-time delete instead of a
 * ranged one) and for 'custom' when the picked dates don't form a valid
 * range (empty, or from after to).
 */
export function resolveClearDataRange(
  preset: ClearDataPreset,
  today: string,
  custom: { from: string; to: string },
): ClearDataRange | null {
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'last7Days':
      return { from: addDays(today, -6), to: today };
    case 'last30Days':
      return { from: addDays(today, -29), to: today };
    case 'custom':
      if (!custom.from || !custom.to || custom.from > custom.to) return null;
      return { from: custom.from, to: custom.to };
    case 'allTime':
      return null;
  }
}
