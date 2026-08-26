import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeaturesOnboardingScreen } from './FeaturesOnboardingScreen';
import { completeFeaturesOnboarding, completeLightingOnboarding } from '../../../api/onboarding';

vi.mock('../../../api/onboarding', () => ({
  completeFeaturesOnboarding: vi.fn(),
  completeLightingOnboarding: vi.fn(),
}));

const mockUpdate = vi.fn();
vi.mock('../../../hooks/useUiSettings', () => ({
  useUiSettingsUpdateSafe: () => mockUpdate,
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FeaturesOnboardingScreen', () => {
  it('defaults every pillar to on', () => {
    render(<FeaturesOnboardingScreen open onComplete={vi.fn()} />);
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(4);
    for (const box of checkboxes) expect(box).toHaveAttribute('aria-checked', 'true');
  });

  it('toggles a pillar off on click', () => {
    render(<FeaturesOnboardingScreen open onComplete={vi.fn()} />);
    const lightingCard = screen.getByRole('checkbox', { name: /lighting.title/ });
    fireEvent.click(lightingCard);
    expect(lightingCard).toHaveAttribute('aria-checked', 'false');
  });

  it('Continue with everything on posts no preference patch, completes onboarding, and calls onComplete', async () => {
    vi.mocked(completeFeaturesOnboarding).mockResolvedValue({ completed: true, featuresCompleted: true });
    const onComplete = vi.fn();
    render(<FeaturesOnboardingScreen open onComplete={onComplete} />);

    fireEvent.click(screen.getByText('featuresOnboarding.continue'));

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith({ lighting: true, cooling: true, monitoring: true, diagnostics: true }));
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(completeLightingOnboarding).not.toHaveBeenCalled();
  });

  it('Continue with a pillar off patches only that flag false', async () => {
    vi.mocked(completeFeaturesOnboarding).mockResolvedValue({ completed: true, featuresCompleted: true });
    const onComplete = vi.fn();
    render(<FeaturesOnboardingScreen open onComplete={onComplete} />);

    fireEvent.click(screen.getByRole('checkbox', { name: /cooling.title/ }));
    fireEvent.click(screen.getByText('featuresOnboarding.continue'));

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(mockUpdate).toHaveBeenCalledWith({ featureCoolingEnabled: false });
  });

  it('turning lighting off also posts lighting-complete, so a reload does not resurrect the device-selection step', async () => {
    vi.mocked(completeFeaturesOnboarding).mockResolvedValue({ completed: true, featuresCompleted: true });
    vi.mocked(completeLightingOnboarding).mockResolvedValue({ completed: true, lightingCompleted: true });
    const onComplete = vi.fn();
    render(<FeaturesOnboardingScreen open onComplete={onComplete} />);

    fireEvent.click(screen.getByRole('checkbox', { name: /lighting.title/ }));
    fireEvent.click(screen.getByText('featuresOnboarding.continue'));

    await waitFor(() => expect(completeLightingOnboarding).toHaveBeenCalled());
    expect(onComplete).toHaveBeenCalledWith({ lighting: false, cooling: true, monitoring: true, diagnostics: true });
  });

  it('shows an error and stays open when the completion write fails', async () => {
    vi.mocked(completeFeaturesOnboarding).mockResolvedValue(null);
    const onComplete = vi.fn();
    render(<FeaturesOnboardingScreen open onComplete={onComplete} />);

    fireEvent.click(screen.getByText('featuresOnboarding.continue'));

    await waitFor(() => expect(screen.getByText('welcome.error')).toBeInTheDocument());
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('renders nothing when closed', () => {
    const { container } = render(<FeaturesOnboardingScreen open={false} onComplete={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
