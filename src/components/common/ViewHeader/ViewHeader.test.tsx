import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ViewHeader } from './ViewHeader';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const tabs = [{ key: 'one', label: 'One' }, { key: 'two', label: 'Two' }];

// The tab row is the element that holds both the tab strip and the rail.
const tabRow = () => screen.getByRole('tablist').parentElement!.parentElement!.parentElement as HTMLElement;

describe('ViewHeader actions', () => {
  it('puts actions inside the tab row, not in a row of their own', () => {
    const { container } = render(<ViewHeader title="Page" tabs={tabs} activeTab="one" actions={<span>Busy</span>} />);
    const header = container.querySelector('header') as HTMLElement;
    const row = tabRow();
    expect(row.contains(screen.getByText('Busy'))).toBe(true);
    expect(header.children).toHaveLength(1);
    expect(header.firstElementChild).toBe(row);
  });

  it('adds no element to the header flow when actions appear over tabs', () => {
    const { container, rerender } = render(<ViewHeader title="Page" tabs={tabs} activeTab="one" />);
    const header = container.querySelector('header') as HTMLElement;
    expect(header.children).toHaveLength(1);
    rerender(<ViewHeader title="Page" tabs={tabs} activeTab="one" actions={<span>Busy</span>} />);
    expect(header.children).toHaveLength(1);
  });

  it('shares the right rail with tabActions', () => {
    render(<ViewHeader title="Page" tabs={tabs} activeTab="one" tabActions={<span>Tools</span>} actions={<span>Busy</span>} />);
    const rail = tabRow().lastElementChild as HTMLElement;
    expect(rail).toContainElement(screen.getByText('Tools'));
    expect(rail).toContainElement(screen.getByText('Busy'));
  });

  it('never adds a row for actions on a header without a tab row', () => {
    const { container } = render(<ViewHeader title="Page" actions={<span>Busy</span>} />);
    const header = container.querySelector('header') as HTMLElement;
    expect(header.children).toHaveLength(0);
    expect(screen.queryByText('Busy')).toBeNull();
  });
});
