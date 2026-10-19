import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LightingPageSwitch } from './LightingPageSwitch';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('LightingPageSwitch', () => {
  it('always renders the link to the Lighting page so the row keeps its height', () => {
    const { rerender } = render(<LightingPageSwitch on={false} onChange={vi.fn()} onSectionNavigate={vi.fn()} />);
    const link = screen.getByText('smartLights.colorOnLightingPage');
    expect(link.closest('span[aria-hidden]')).toHaveStyle({ visibility: 'hidden' });
    expect(screen.queryByRole('button', { name: 'smartLights.colorOnLightingPage' })).not.toBeInTheDocument();
    rerender(<LightingPageSwitch on onChange={vi.fn()} onSectionNavigate={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'smartLights.colorOnLightingPage' })).not.toBeDisabled();
  });

  it('opens the Lighting page from the link when on', () => {
    const navigate = vi.fn();
    render(<LightingPageSwitch on onChange={vi.fn()} onSectionNavigate={navigate} />);
    fireEvent.click(screen.getByRole('button', { name: 'smartLights.colorOnLightingPage' }));
    expect(navigate).toHaveBeenCalledWith('lighting');
  });

  it('has no link without a navigator', () => {
    render(<LightingPageSwitch on onChange={vi.fn()} />);
    expect(screen.queryByText('smartLights.colorOnLightingPage')).not.toBeInTheDocument();
  });
});
