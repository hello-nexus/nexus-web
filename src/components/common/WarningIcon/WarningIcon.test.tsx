import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WarningIcon } from './WarningIcon';

describe('WarningIcon', () => {
  it('labels the icon with the message', () => {
    render(<WarningIcon message="Fan can stop" />);
    expect(screen.getByRole('img', { name: 'Fan can stop' })).toBeInTheDocument();
  });

  it('shows the message in a tooltip when the icon is reached', () => {
    render(<WarningIcon message="Fan can stop" />);
    fireEvent.focus(screen.getByRole('img', { name: 'Fan can stop' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Fan can stop');
  });

  it('defaults to the warning tone and switches to critical', () => {
    const { rerender } = render(<WarningIcon message="m" />);
    expect(screen.getByRole('img').className).toContain('warning');
    rerender(<WarningIcon message="m" tone="critical" />);
    expect(screen.getByRole('img').className).toContain('critical');
  });

  it('passes a class through to the icon', () => {
    render(<WarningIcon message="m" className="extra" />);
    expect(screen.getByRole('img').className).toContain('extra');
  });
});
