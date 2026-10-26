import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PanelPageIndicator } from './PanelPageIndicator';

vi.mock('../../lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe('PanelPageIndicator', () => {
  it('is a passive indicator without onSelect', () => {
    render(<PanelPageIndicator total={3} active={1} />);
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });

  it('turns each dot into a tab that jumps to its page', () => {
    const onSelect = vi.fn();
    render(<PanelPageIndicator total={3} active={1} onSelect={onSelect} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(tabs[2]);
    expect(onSelect).toHaveBeenCalledWith(2);
  });
});
