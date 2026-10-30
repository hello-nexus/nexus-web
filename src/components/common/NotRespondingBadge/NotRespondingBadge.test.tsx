import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { NotRespondingBadge } from './NotRespondingBadge';

describe('NotRespondingBadge', () => {
  it('is a button named by its label and tooltip that fires onClick', () => {
    const onClick = vi.fn();
    render(<NotRespondingBadge onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'lighting.writeHealth.badge. lighting.writeHealth.tooltip' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
