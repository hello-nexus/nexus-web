// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { stableRecentAppsOrder } from './recentAppsView';
import type { RecentApp } from '../../../api/deck';
import vectorsFile from './recentAppsOrder.vectors.json';

interface RecentAppsOrderVectorCase {
  name: string;
  cols: number;
  rows: number;
  currentPage: number;
  previousFocused: string | null;
  focusedProcessKey: string | null;
  ring: string[];
  previousOrder: string[] | null;
  expected: string[];
}

// Copied verbatim from nexus-service/tests/Deck/recentAppsOrder.vectors.json.
const { cases } = vectorsFile as { description: string; cases: RecentAppsOrderVectorCase[] };

function app(processKey: string): RecentApp {
  return { processKey, name: processKey.toUpperCase(), lastFocusedUtcMs: 0 };
}

describe('stableRecentAppsOrder (shared vectors, mirrored in nexus-service/tests/Deck/recentAppsOrder.vectors.json)', () => {
  it.each(cases)('$name', ({ ring, previousOrder, previousFocused, focusedProcessKey, cols, rows, currentPage, expected }) => {
    const ordered = stableRecentAppsOrder(ring.map(app), previousOrder, previousFocused, focusedProcessKey, cols, rows, currentPage);
    expect(ordered.map(a => a.processKey)).toEqual(expected);
  });
});
