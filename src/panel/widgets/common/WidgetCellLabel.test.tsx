import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WidgetCellLabel } from './WidgetCellLabel';

describe('WidgetCellLabel', () => {
  it('renders the label text', () => {
    const { container } = render(<WidgetCellLabel label="Cooling" />);
    const node = container.firstElementChild as HTMLElement | null;
    expect(node).not.toBeNull();
    expect(node!.textContent).toBe('Cooling');
  });
});
