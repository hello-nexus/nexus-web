import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PanelLayout } from '../types';
import { editTargetGone, latestOr, useSyncLatestLayout } from './latestLayout';

const layout = (id: string): PanelLayout => ({ layoutSchemaVersion: 2, surface: 'monitor', pages: [{ id, widgets: [] }] });

describe('latest layout', () => {
  it('builds on a queued layout until a render catches up', () => {
    const ref = { current: null as PanelLayout | null };
    const a = layout('a');
    const b = layout('b');
    const view = renderHook(({ rendered }) => useSyncLatestLayout(ref, rendered), { initialProps: { rendered: a } });
    expect(latestOr(ref, a)).toBe(a);
    ref.current = b;
    expect(latestOr(ref, a)).toBe(b);
    view.rerender({ rendered: b });
    expect(ref.current).toBe(b);
    const c = layout('c');
    view.rerender({ rendered: c });
    expect(latestOr(ref, c)).toBe(c);
  });

  it('ends an edit session whose widget left the layout, except a playlist stand-in', () => {
    expect(editTargetGone('w1', false, false)).toBe(true);
    expect(editTargetGone('w1', true, false)).toBe(false);
    expect(editTargetGone('playlist:clock', false, true)).toBe(false);
    expect(editTargetGone(null, false, false)).toBe(false);
  });
});
