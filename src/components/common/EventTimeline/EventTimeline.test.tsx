import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { EventTimeline, type EventTimelineEvent, type EventTimelineLane } from './EventTimeline';

const lanes: EventTimelineLane[] = [
  { id: 'a', label: 'Lane A' },
  { id: 'b', label: 'Lane B' },
];

// Under jsdom the ResizeObserver stub never fires, so the plot keeps its 440px
// default width; xFor maps [0,1000] across ~420 usable px, so events 8 time
// units apart (~3.4px) cluster and events hundreds apart stay separate.
const events: EventTimelineEvent[] = [
  { id: 'a1', laneId: 'a', t: 100, color: 'var(--warn)' },
  { id: 'a2', laneId: 'a', t: 500, color: 'var(--warn)', weight: 1 },
  { id: 'a3', laneId: 'a', t: 508, color: 'var(--bad)', weight: 2 },
  { id: 'b1', laneId: 'b', t: 800, color: 'var(--text-dim)' },
];

function renderTimeline(overrides?: { lanes?: EventTimelineLane[]; events?: EventTimelineEvent[] }) {
  return render(
    <EventTimeline
      lanes={overrides?.lanes ?? lanes}
      events={overrides?.events ?? events}
      domain={[0, 1000]}
      xTickFormat={t => String(t)}
      renderTooltip={cluster => <div>{`${cluster.events.length} in ${cluster.laneId} ${cluster.color}`}</div>}
      emptyLabel="no lanes"
    />,
  );
}

describe('EventTimeline', () => {
  it('renders one label per lane', () => {
    renderTimeline();
    expect(screen.getByText('Lane A')).toBeInTheDocument();
    expect(screen.getByText('Lane B')).toBeInTheDocument();
  });

  it('collapses near-coincident same-lane events into one counted cluster', () => {
    const { container } = renderTimeline();
    // a2 + a3 collapse -> one cluster showing count 2; the lone a1 and b1 show none.
    expect(screen.getByText('2')).toBeInTheDocument();
    // Three clusters total (a{100}, a{500,508}, b{800}) => three hit targets.
    expect(container.querySelectorAll('circle[fill="transparent"]')).toHaveLength(3);
  });

  it('takes the highest-weight event color for a mixed cluster', () => {
    const { container } = renderTimeline();
    fireEvent.mouseEnter(container.querySelectorAll('circle[fill="transparent"]')[1]);
    // a3 (weight 2, --bad) outranks a2 (weight 1, --warn).
    expect(screen.getByText('2 in a var(--bad)')).toBeInTheDocument();
  });

  it('shows a tooltip on hover and clears it on leave', () => {
    const { container } = renderTimeline();
    const hit = container.querySelectorAll('circle[fill="transparent"]')[0];
    fireEvent.mouseEnter(hit);
    expect(screen.getByText('1 in a var(--warn)')).toBeInTheDocument();
    fireEvent.mouseLeave(hit);
    expect(screen.queryByText('1 in a var(--warn)')).not.toBeInTheDocument();
  });

  it('pins a tooltip on click so it survives pointer leave', () => {
    const { container } = renderTimeline();
    const hit = container.querySelectorAll('circle[fill="transparent"]')[2];
    fireEvent.click(hit);
    expect(screen.getByText('1 in b var(--text-dim)')).toBeInTheDocument();
  });

  it('renders the empty label when there are no lanes', () => {
    renderTimeline({ lanes: [], events: [] });
    expect(screen.getByText('no lanes')).toBeInTheDocument();
  });
});
