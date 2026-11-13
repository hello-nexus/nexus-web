import { describe, expect, it } from 'vitest';
import { computeEdges, revealOffset, scrollDelta } from './tabOverflow';

describe('computeEdges', () => {
  it('reports no overflow when content fits', () => {
    expect(computeEdges(0, 300, 300).overflow).toBe(false);
  });
  it('tolerates sub-pixel slack', () => {
    expect(computeEdges(0, 300.8, 300).overflow).toBe(false);
  });
  it('flags start, middle and end positions', () => {
    expect(computeEdges(0, 600, 300)).toEqual({ overflow: true, atStart: true, atEnd: false });
    expect(computeEdges(150, 600, 300)).toEqual({ overflow: true, atStart: false, atEnd: false });
    expect(computeEdges(300, 600, 300)).toEqual({ overflow: true, atStart: false, atEnd: true });
  });
});

describe('computeEdges host width', () => {
  it('reports no overflow when tabs fit the host but not the arrow-reduced scroller', () => {
    expect(computeEdges(0, 280, 250, 300).overflow).toBe(false);
  });
  it('reports overflow when tabs exceed the host', () => {
    expect(computeEdges(0, 350, 250, 300).overflow).toBe(true);
  });
});

describe('revealOffset', () => {
  it('keeps the offset when the tab is visible', () => {
    expect(revealOffset(100, 300, 150, 80)).toBe(100);
  });
  it('scrolls left to a tab hidden before the view', () => {
    expect(revealOffset(200, 300, 120, 80)).toBe(120);
  });
  it('scrolls right to a tab hidden after the view', () => {
    expect(revealOffset(0, 300, 450, 100)).toBe(250);
  });
});

describe('scrollDelta', () => {
  it('moves three quarters of the viewport in the given direction', () => {
    expect(scrollDelta(1, 400)).toBe(300);
    expect(scrollDelta(-1, 400)).toBe(-300);
  });
});
