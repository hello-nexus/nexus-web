import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ImmersiveLayout } from './ImmersiveLayout';

// A single immersive page renders the cells directly with no pager chrome;
// multiple pages render a PanelPageIndicator (role="tablist") with one dot per
// page. These assertions key on that tablist to count pages.
function pageDots(): number {
  const tablist = screen.queryByRole('tablist');
  return tablist ? tablist.querySelectorAll('span').length : 1;
}

describe('ImmersiveLayout pagination', () => {
  const twoCells = [<div key="a">a</div>, <div key="b">b</div>];

  // The runtime phone grid loses a row pair to the browser URL bar, landing at
  // 4x6 instead of the design's 4x8. The fill cell absorbs the partial
  // remainder, so the 4x4 preview + editor must stay on one page (ceil(6/4)=2),
  // not split (floor(6/4)=1). This is the OnePlus 12 / Android-flagship bug.
  it('keeps a 2-cell widget on one page at 4x6 (phone portrait with URL bar)', () => {
    render(<ImmersiveLayout cells={twoCells} gridColumns={4} gridRows={6} />);
    expect(pageDots()).toBe(1);
  });

  it('keeps a 2-cell widget on one page at 4x8 (full-height phone portrait)', () => {
    render(<ImmersiveLayout cells={twoCells} gridColumns={4} gridRows={8} />);
    expect(pageDots()).toBe(1);
  });

  it('keeps a 2-cell widget on one page at 4x16 (Y70 portrait)', () => {
    render(<ImmersiveLayout cells={twoCells} gridColumns={4} gridRows={16} />);
    expect(pageDots()).toBe(1);
  });

  // fillLast=false has no remainder-absorbing cell, so every tile needs a full
  // 4x4 and the count floors - matching monitoring's equal-tile behavior.
  it('paginates fixed (fillLast=false) tiles that overflow the long axis', () => {
    const fourCells = ['a', 'b', 'c', 'd'].map(k => <div key={k}>{k}</div>);
    render(<ImmersiveLayout cells={fourCells} gridColumns={4} gridRows={8} fillLast={false} />);
    expect(pageDots()).toBe(2);
  });

  it('honors an explicit cellsPerPage override', () => {
    const fourCells = ['a', 'b', 'c', 'd'].map(k => <div key={k}>{k}</div>);
    render(<ImmersiveLayout cells={fourCells} gridColumns={4} gridRows={8} cellsPerPage={1} />);
    expect(pageDots()).toBe(4);
  });
});
