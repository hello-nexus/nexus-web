import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeatureDisabled, FeatureGate } from './FeatureDisabled';
import type { FeatureFlags, FeatureKey } from '../../../hooks/useUiSettings';

const mockUpdate = vi.fn();
let mockFlags: FeatureFlags = { lighting: true, cooling: true, monitoring: true, diagnostics: true };

vi.mock('../../../hooks/useUiSettings', () => ({
  useFeatureFlags: () => mockFlags,
  useUiSettingsUpdateSafe: () => mockUpdate,
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

beforeEach(() => {
  mockUpdate.mockClear();
  mockFlags = { lighting: true, cooling: true, monitoring: true, diagnostics: true };
});

const CASES: { feature: FeatureKey; titleKey: string; settingsKey: string }[] = [
  { feature: 'lighting', titleKey: 'lighting.title', settingsKey: 'featureLightingEnabled' },
  { feature: 'cooling', titleKey: 'cooling.title', settingsKey: 'featureCoolingEnabled' },
  { feature: 'monitoring', titleKey: 'nav.monitoring', settingsKey: 'featureMonitoringEnabled' },
  { feature: 'diagnostics', titleKey: 'diagnostics.title', settingsKey: 'featureDiagnosticsEnabled' },
];

describe('FeatureDisabled', () => {
  it.each(CASES)('renders the $feature title and hint', ({ feature, titleKey }) => {
    render(<FeatureDisabled feature={feature} />);
    expect(screen.getByRole('heading', { name: titleKey })).toBeInTheDocument();
    expect(screen.getByText(`featureDisabled.hint.${feature}`)).toBeInTheDocument();
  });

  it('animates the toggle to checked immediately on click, ahead of the write settling', () => {
    render(<FeatureDisabled feature="lighting" />);
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  describe('re-enable delay', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it.each(CASES)('patches $feature only after the delay, and disables the toggle meanwhile', ({ feature, settingsKey }) => {
      render(<FeatureDisabled feature={feature} />);
      const toggle = screen.getByRole('switch');

      fireEvent.click(toggle);
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(toggle).toBeDisabled();

      act(() => { vi.advanceTimersByTime(400); });
      expect(mockUpdate).toHaveBeenCalledWith({ [settingsKey]: true });
    });

    it('ignores a second click while the write is pending', () => {
      render(<FeatureDisabled feature="lighting" />);
      const toggle = screen.getByRole('switch');
      fireEvent.click(toggle);
      fireEvent.click(toggle);
      act(() => { vi.advanceTimersByTime(400); });
      expect(mockUpdate).toHaveBeenCalledTimes(1);
    });
  });
});

describe('FeatureGate', () => {
  it('renders its children when the feature is enabled', () => {
    mockFlags = { ...mockFlags, lighting: true };
    render(<FeatureGate feature="lighting"><div>live page</div></FeatureGate>);
    expect(screen.getByText('live page')).toBeInTheDocument();
  });

  it('renders the disabled shell instead of its children when the feature is off', () => {
    mockFlags = { ...mockFlags, lighting: false };
    render(<FeatureGate feature="lighting"><div>live page</div></FeatureGate>);
    expect(screen.queryByText('live page')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'lighting.title' })).toBeInTheDocument();
  });

  it('renders children immediately on mount with no shell frame, even when the flag was off a moment ago', () => {
    mockFlags = { ...mockFlags, lighting: false };
    const { rerender } = render(<FeatureGate feature="lighting"><div>live page</div></FeatureGate>);
    expect(screen.queryByText('live page')).not.toBeInTheDocument();

    mockFlags = { ...mockFlags, lighting: true };
    rerender(<FeatureGate feature="lighting"><div>live page</div></FeatureGate>);
    expect(screen.getByText('live page')).toBeInTheDocument();
  });
});
