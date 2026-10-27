// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { TopologyDisplay } from '../../../api/displays';
import { identifyPayload } from './identifyPayload';

const display = (id: string, name: string, number: number): TopologyDisplay => ({ id, name, number } as TopologyDisplay);

describe('identifyPayload', () => {
  it('labels each display as the diagram does and carries its name', () => {
    expect(identifyPayload([display('a', 'DELL U2720Q', 2), display('b', 'Xeneon Edge', 0)])).toEqual([
      { displayId: 'a', label: '2', name: 'DELL U2720Q' },
      { displayId: 'b', label: '1', name: 'Xeneon Edge' },
    ]);
  });

  it('falls back to diagram order when the platform reports no number', () => {
    const out = identifyPayload([display('a', 'A', 0), display('b', 'B', 0), display('c', 'C', 0)]);
    expect(out.map(e => e.label)).toEqual(['1', '2', '3']);
  });
});
