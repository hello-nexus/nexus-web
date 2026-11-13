import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StatusRow } from './StatusRow';

describe('StatusRow', () => {
  it('orders name, then the chip above the value, then the toggle', () => {
    const { container } = render(
      <StatusRow name="CPU Package" value="45 C" chip={<span>OK</span>} toggle={<button type="button">sw</button>} />,
    );
    const body = (container.firstChild as HTMLElement).firstChild!.firstChild as HTMLElement;
    const kids = Array.from(body.children).map(c => c.textContent);
    expect(kids).toEqual(['CPU Package', 'OK45 C', 'sw']);
    const status = body.children[1];
    expect(Array.from(status.children).map(c => c.textContent)).toEqual(['OK', '45 C']);
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

  it('keeps a long name and a unit reading apart: the reading is one text node and the name is clamped', () => {
    const { container } = render(
      <StatusRow name="NVIDIA GeForce RTX 5080 GPU Core Voltage" value="0.87 V" chip={<span>OK</span>} />,
    );
    expect(screen.getByText('0.87 V').textContent).toBe('0.87 V');
    expect(container.querySelector('[class*="nameText"]')).toHaveTextContent('NVIDIA GeForce RTX 5080 GPU Core Voltage');
  });

  it('offers the full name in a tooltip only when the name is cut', () => {
    const scroll = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(80);
    const client = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(40);
    try {
      render(<StatusRow name="A very long sensor name that needs more than two lines" onSelect={() => {}} />);
      fireEvent.focus(screen.getByRole('button'));
      return waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent('A very long sensor name'));
    } finally {
      scroll.mockRestore();
      client.mockRestore();
    }
  });

  it('has no tooltip for a name that fits', () => {
    render(<StatusRow name="Fan" onSelect={() => {}} />);
    fireEvent.focus(screen.getByRole('button'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows a subtitle under the name, keeps the name on one line, and adds no child to the row body', () => {
    const { container } = render(<StatusRow name="Ryzen" subtitle="Core (Tctl/Tdie)" value="61 C" />);
    const body = (container.firstChild as HTMLElement).firstChild!.firstChild as HTMLElement;
    expect(Array.from(body.children).map(c => c.textContent)).toEqual(['RyzenCore (Tctl/Tdie)', '61 C']);
    expect(container.querySelector('[class*="nameText"]')?.className).toMatch(/oneLine/);
  });

  it('renders nothing for an empty subtitle', () => {
    const { container } = render(<StatusRow name="Ryzen" subtitle="" />);
    expect(container.querySelector('[class*="subtitle"]')).toBeNull();
    expect(container.querySelector('[class*="nameText"]')?.className).not.toMatch(/oneLine/);
  });

  it('offers the full subtitle in a tooltip only when it is cut', () => {
    const scroll = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(200);
    const client = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(80);
    try {
      const { container } = render(<StatusRow name="Ryzen" subtitle="A very long sensor description" />);
      fireEvent.focus(container.querySelector('[class*="subtitle"]')!);
      return waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent('A very long sensor description'));
    } finally {
      scroll.mockRestore();
      client.mockRestore();
    }
  });

  it('wraps the chip in its own line and keeps the icon in a padded slot', () => {
    const { container } = render(<StatusRow name="CPU" icon={<svg data-testid="ic" />} value="45 C" chip={<span>OK</span>} />);
    const chipLine = container.querySelector('[class*="chipLine"]');
    expect(chipLine?.textContent).toBe('OK');
    expect(container.querySelector('[class*="icon"]')).toContainElement(screen.getByTestId('ic'));
  });
});
