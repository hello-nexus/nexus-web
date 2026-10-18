import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FreeformSizeButton } from './FreeformSizeButton';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('FreeformSizeButton', () => {
  it('is a labelled button that presses once and reflects the freeform state', () => {
    const onPress = vi.fn();
    const { rerender } = render(<FreeformSizeButton active={false} onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'devices.panels.widgetSettings.freeform.aria' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('devices.panels.widgetSettings.freeform')).toBeInTheDocument();
    fireEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
    rerender(<FreeformSizeButton active onPress={onPress} />);
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });
});
