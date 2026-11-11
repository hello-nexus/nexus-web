import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StatusRow } from './StatusRow';

describe('StatusRow', () => {
  it('orders name, then the value above the chip, then the toggle', () => {
    const { container } = render(
      <StatusRow name="CPU Package" value="45 C" chip={<span>OK</span>} toggle={<button type="button">sw</button>} />,
    );
    const body = (container.firstChild as HTMLElement).firstChild!.firstChild as HTMLElement;
    const kids = Array.from(body.children).map(c => c.textContent);
    expect(kids).toEqual(['CPU Package', '45 COK', 'sw']);
    const status = body.children[1];
    expect(Array.from(status.children).map(c => c.textContent)).toEqual(['45 C', 'OK']);
  });

  it('shows name and toggle only when there is no reading', () => {
    render(<StatusRow name="Fan" toggle={<button type="button">sw</button>} dimmed />);
    expect(screen.getByText('Fan')).toBeInTheDocument();
    expect(screen.getByText('sw')).toBeInTheDocument();
  });

  it('selects through the name button, and the toggle does not select', () => {
    const onSelect = vi.fn();
    render(<StatusRow name="Fan" selected onSelect={onSelect} toggle={<button type="button">sw</button>} />);
    fireEvent.click(screen.getByText('sw'));
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Fan' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Fan' })).toHaveAttribute('aria-pressed', 'true');
  });
});
