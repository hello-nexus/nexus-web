import { describe, expect, it } from 'vitest';
import { parseCaseLayout } from './caseLayout';

const card = (fans: Record<string, unknown>) => ({
  slot: 'gpu', role: 'part', min: [100, 100, 40], size: [300, 40, 120],
  fans: { axis: 'y', side: 'min', count: 3, diameter: 90, ...fans },
});
const layoutOf = (fans: Record<string, unknown>) => parseCaseLayout({ size: [480, 360, 440], boxes: [card(fans)], fanSlots: [] })!;
const gpuSlots = (fans: Record<string, unknown>) => layoutOf(fans).fanSlots.filter(s => s.position === 'gpu');

describe('card airflow properties', () => {
  it('parses valid values and drops invalid ones', () => {
    const ok = layoutOf({ flowThrough: [2, 0, 2], bracketExhaust: 'blower', bracket: { axis: 'x', side: 'max' } }).boxes[0].fans!;
    expect(ok).toMatchObject({ flowThrough: [0, 2], bracketExhaust: 'blower', bracket: { axis: 'x', side: 'max' } });
    const bad = layoutOf({ flowThrough: [3], bracketExhaust: 'jet', bracket: { axis: 'y', side: 'max' } }).boxes[0].fans!;
    expect(bad.flowThrough).toBeUndefined();
    expect(bad.bracketExhaust).toBeUndefined();
    expect(bad.bracket).toBeUndefined();
  });

  it('flags the fan at a bracket-end index, counted from the bracket end', () => {
    expect(gpuSlots({ sizes: [80, 80, 80], flowThrough: [2] }).map(s => !!s.flowThrough)).toEqual([false, false, true]);
    expect(gpuSlots({ flowThrough: [2] }).map(s => !!s.flowThrough)).toEqual([true, false, false]);
  });

  it('counts from the min end when the bracket sits there', () => {
    const slots = gpuSlots({ sizes: [80, 80, 80], flowThrough: [2], bracket: { axis: 'x', side: 'min' } });
    expect(slots.map(s => !!s.flowThrough)).toEqual([false, false, true]);
    const xs = slots.map(s => s.box!.min[0]);
    expect(xs[0]).toBeLessThan(xs[1]);
    expect(xs[1]).toBeLessThan(xs[2]);
    expect(gpuSlots({ flowThrough: [2], bracket: { axis: 'x', side: 'min' } }).map(s => !!s.flowThrough)).toEqual([false, false, true]);
  });

  it('lays the fans along the stated bracket axis', () => {
    const slots = gpuSlots({ sizes: [60, 60, 60], bracket: { axis: 'z', side: 'max' } });
    const zs = slots.map(s => s.box!.min[2]);
    expect(zs[0]).toBeGreaterThan(zs[1]);
    expect(new Set(slots.map(s => s.box!.min[0])).size).toBe(1);
  });

  it('names the card each fan belongs to', () => {
    const slots = parseCaseLayout({ size: [480, 360, 440], boxes: [card({ count: 2 }), { ...card({ count: 1 }), select: 'gpu:1' }], fanSlots: [] })!.fanSlots.filter(s => s.position === 'gpu');
    expect(slots.map(s => s.card)).toEqual(['', '', 'gpu:1']);
  });
});
