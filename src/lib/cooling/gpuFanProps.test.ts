import { describe, expect, it } from 'vitest';
import { parseCaseLayout } from './caseLayout';

const card = (fans: Record<string, unknown>) => ({
  slot: 'gpu', role: 'part', min: [100, 100, 40], size: [300, 40, 120],
  fans: { axis: 'y', side: 'min', count: 3, diameter: 90, ...fans },
});
const layoutOf = (fans: Record<string, unknown>) => parseCaseLayout({ size: [480, 360, 440], boxes: [card(fans)], fanSlots: [] })!;

describe('card airflow properties', () => {
  it('parses valid values and drops invalid ones', () => {
    const ok = layoutOf({ flowThrough: [2, 0, 2], boardLength: 250, bracketExhaust: 'blower' }).boxes[0].fans!;
    expect(ok).toMatchObject({ flowThrough: [0, 2], boardLength: 250, bracketExhaust: 'blower' });
    const bad = layoutOf({ flowThrough: [3], boardLength: -1, bracketExhaust: 'jet' }).boxes[0].fans!;
    expect(bad.flowThrough).toBeUndefined();
    expect(bad.boardLength).toBeUndefined();
    expect(bad.bracketExhaust).toBeUndefined();
  });

  it('flags the fan at a bracket-end index, counted from the bracket end', () => {
    const sized = layoutOf({ sizes: [80, 80, 80], flowThrough: [2] }).fanSlots.filter(s => s.position === 'gpu');
    expect(sized.map(s => !!s.flowThrough)).toEqual([false, false, true]);
    const unsized = layoutOf({ flowThrough: [2] }).fanSlots.filter(s => s.position === 'gpu');
    expect(unsized.map(s => !!s.flowThrough)).toEqual([true, false, false]);
  });

  it('flags every fan past the board end', () => {
    const slots = layoutOf({ sizes: [80, 80, 80], boardLength: 150 }).fanSlots.filter(s => s.position === 'gpu');
    expect(slots.map(s => !!s.flowThrough)).toEqual([false, true, true]);
  });
});
