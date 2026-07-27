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

// The media immersive view (art cell + player cell) uses fillLast=false so both
// stay a true 4x4 and the pair centres, plus cellsPerPage=2 so short grids keep
// them on one page instead of flooring to one cell per page.
describe('ImmersiveLayout in the media two-cell configuration', () => {
  const mediaCells = [<div key="art">art</div>, <div key="player">player</div>];

  function renderMedia(cols: number, rows: number) {
    const { container } = render(
      <ImmersiveLayout cells={mediaCells} gridColumns={cols} gridRows={rows} fillLast={false} cellsPerPage={2} />,
    );
    const layout = container.querySelector('[data-orientation]') as HTMLElement;
    const cells = Array.from(layout.children) as HTMLElement[];
    return { layout, cells };
  }

  it('places both cells side by side on one page for the Xeneon Edge landscape grid', () => {
    const { layout, cells } = renderMedia(14, 4);
    expect(pageDots()).toBe(1);
    expect(layout.dataset.orientation).toBe('landscape');
    // data-fixed centres the pair rather than letting the player absorb the
    // remaining 10 columns of the panel.
    expect(layout.dataset.fixed).toBe('true');
    expect(cells).toHaveLength(2);
    // Each cell is 4 of the 14 columns.
    for (const cell of cells) expect(cell.style.flexBasis).toBe('28.5714%');
    // No cell grows.
    expect(cells.some(c => c.dataset.fill === 'true')).toBe(false);
  });

  it('stacks the same two cells on one page in the Xeneon Edge portrait grid', () => {
    const { layout, cells } = renderMedia(4, 14);
    expect(pageDots()).toBe(1);
    expect(layout.dataset.orientation).toBe('portrait');
    expect(cells).toHaveLength(2);
    for (const cell of cells) expect(cell.style.flexBasis).toBe('28.5714%');
  });

  it('keeps both cells on one page on a short phone portrait grid', () => {
    // floor(6/4) = 1 would split art and player across a swipe; the explicit
    // cellsPerPage keeps them together and the fixed cells shrink to fit.
    expect(renderMedia(4, 6).cells).toHaveLength(2);
    expect(pageDots()).toBe(1);
  });
});
